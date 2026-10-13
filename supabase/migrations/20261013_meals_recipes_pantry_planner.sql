-- Meals, recipes, pantry and shopping integration.
create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category text not null default 'other'
    check (category in ('produce','dairy','meat','grains','drinks','snacks','cleaning','other')),
  quantity numeric not null default 0 check (quantity >= 0),
  unit text not null default 'unidad',
  minimum_quantity numeric not null default 0 check (minimum_quantity >= 0),
  location text not null default 'pantry'
    check (location in ('pantry','fridge','freezer','other')),
  expires_on date,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  description text,
  servings integer not null default 2 check (servings > 0 and servings <= 100),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  cook_minutes integer not null default 0 check (cook_minutes >= 0),
  instructions text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  pantry_item_id uuid references public.pantry_items(id) on delete set null,
  ingredient_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default 'unidad',
  optional boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_title text,
  servings integer check (servings is null or (servings > 0 and servings <= 100)),
  notes text,
  status text not null default 'planned' check (status in ('planned','prepared','skipped')),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recipe_id is not null or nullif(trim(custom_title),'') is not null),
  unique (household_id,meal_date,meal_type)
);

alter table public.list_items
  add column if not exists source_pantry_item_id uuid references public.pantry_items(id) on delete set null,
  add column if not exists source_recipe_id uuid references public.recipes(id) on delete set null;

create index if not exists idx_pantry_items_household_active on public.pantry_items(household_id,active);
create index if not exists idx_pantry_items_household_expiry on public.pantry_items(household_id,expires_on) where active=true;
create index if not exists idx_recipes_household_active on public.recipes(household_id,active);
create index if not exists idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id,sort_order);
create index if not exists idx_recipe_ingredients_pantry on public.recipe_ingredients(pantry_item_id);
create index if not exists idx_meal_plan_household_date on public.meal_plan_entries(household_id,meal_date);
create index if not exists idx_meal_plan_recipe on public.meal_plan_entries(recipe_id);
create index if not exists idx_list_items_source_pantry on public.list_items(source_pantry_item_id);

alter table public.pantry_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_entries enable row level security;

create policy pantry_items_member on public.pantry_items for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy recipes_member on public.recipes for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy recipe_ingredients_member on public.recipe_ingredients for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy meal_plan_entries_member on public.meal_plan_entries for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

grant select,insert,update,delete on public.pantry_items,public.recipes,public.recipe_ingredients,public.meal_plan_entries to authenticated;

create or replace function public.complete_meal_plan(p_entry_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_entry public.meal_plan_entries%rowtype;
  v_recipe public.recipes%rowtype;
  v_ratio numeric:=1;
begin
  select * into v_entry from public.meal_plan_entries where id=p_entry_id for update;
  if not found then raise exception 'Meal plan entry not found'; end if;
  if not public.is_household_member(v_entry.household_id) then raise exception 'Not a household member'; end if;
  if v_entry.status='prepared' then return; end if;

  if v_entry.recipe_id is not null then
    select * into v_recipe from public.recipes where id=v_entry.recipe_id;
    if found and v_recipe.servings>0 then
      v_ratio:=coalesce(v_entry.servings,v_recipe.servings)::numeric/v_recipe.servings::numeric;
    end if;

    update public.pantry_items p
    set quantity=greatest(0,p.quantity-(ri.quantity*v_ratio)),updated_at=now()
    from public.recipe_ingredients ri
    where ri.recipe_id=v_entry.recipe_id
      and ri.pantry_item_id=p.id
      and ri.optional=false
      and p.household_id=v_entry.household_id;
  end if;

  update public.meal_plan_entries
  set status='prepared',completed_at=now(),updated_at=now()
  where id=p_entry_id;
end $$;

revoke execute on function public.complete_meal_plan(uuid) from public,anon;
grant execute on function public.complete_meal_plan(uuid) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pantry_items') then
    alter publication supabase_realtime add table public.pantry_items;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='recipes') then
    alter publication supabase_realtime add table public.recipes;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='recipe_ingredients') then
    alter publication supabase_realtime add table public.recipe_ingredients;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meal_plan_entries') then
    alter publication supabase_realtime add table public.meal_plan_entries;
  end if;
end $$;
