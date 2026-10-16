import WorkspaceTitle from './WorkspaceTitle';
import ModuleLoading from './ModuleLoading';
import RecipePhoto from './RecipePhoto';
import ModuleIcon from './ModuleIcon';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {Check,CheckCircle2,ChevronLeft,ChevronRight,Clock3,Minus,Package,Plus,Search,ShoppingCart,Trash2,X} from 'lucide-react';
import {supabase} from './lib/supabase';

type Household={id:string;name:string;invite_code:string};
type MealType='breakfast'|'lunch'|'dinner'|'snack';
type PantryCategory='produce'|'dairy'|'meat'|'grains'|'drinks'|'snacks'|'cleaning'|'other';
type PantryLocation='pantry'|'fridge'|'freezer'|'other';

type PantryItem={
 id:string;name:string;category:PantryCategory;quantity:number;unit:string;minimum_quantity:number;location:PantryLocation;
 expires_on:string|null;notes:string|null;active:boolean;
};
type Recipe={
 id:string;name:string;description:string|null;servings:number;prep_minutes:number;cook_minutes:number;instructions:string|null;notes:string|null;active:boolean;
};
type Ingredient={
 id:string;recipe_id:string;pantry_item_id:string|null;ingredient_name:string;quantity:number;unit:string;optional:boolean;sort_order:number;
};
type MealPlan={
 id:string;meal_date:string;meal_type:MealType;recipe_id:string|null;custom_title:string|null;servings:number|null;notes:string|null;status:'planned'|'prepared'|'skipped';
};
type IngredientDraft={ingredient_name:string;quantity:string;unit:string;pantry_item_id:string;optional:boolean};

const pantryCategories:{id:PantryCategory;label:string}[]=[
 {id:'produce',label:'Frutas y verduras'},{id:'dairy',label:'Lácteos'},{id:'meat',label:'Carnes'},{id:'grains',label:'Granos y pastas'},
 {id:'drinks',label:'Bebidas'},{id:'snacks',label:'Snacks'},{id:'cleaning',label:'Limpieza'},{id:'other',label:'Otros'}
];
const pantryLocations:{id:PantryLocation;label:string}[]=[
 {id:'pantry',label:'Despensa'},{id:'fridge',label:'Refrigerador'},{id:'freezer',label:'Congelador'},{id:'other',label:'Otro'}
];
const mealTypes:{id:MealType;label:string}[]=[
 {id:'breakfast',label:'Desayuno'},{id:'lunch',label:'Almuerzo'},{id:'dinner',label:'Cena'},{id:'snack',label:'Snack'}
];

const iso=(d=new Date())=>{const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)};
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const startOfWeek=(d=new Date())=>{const x=new Date(d);x.setHours(0,0,0,0);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return x};
const fmtQty=(n:number)=>Number.isInteger(n)?String(n):Number(n.toFixed(2)).toString();
const fmtDate=(value:string)=>new Date(value+'T12:00').toLocaleDateString('es-GT',{weekday:'short',day:'numeric',month:'short'}).replace('.','');
const pantryCategoryLabel=(id:PantryCategory)=>pantryCategories.find(x=>x.id===id)?.label||'Otros';
const pantryLocationLabel=(id:PantryLocation)=>pantryLocations.find(x=>x.id===id)?.label||'Otro';
const mealTypeLabel=(id:MealType)=>mealTypes.find(x=>x.id===id)?.label||'Comida';

export default function MealsCenter({household,onNavigate,readOnly=false}:{household:Household;onNavigate?:(tab:string)=>void;readOnly?:boolean}){
 const [tab,setTab]=useState<'planner'|'recipes'|'pantry'>('planner');
 const [week,setWeek]=useState(()=>startOfWeek(new Date()));
 const [pantry,setPantry]=useState<PantryItem[]>([]),[recipes,setRecipes]=useState<Recipe[]>([]),[ingredients,setIngredients]=useState<Ingredient[]>([]),[meals,setMeals]=useState<MealPlan[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const [query,setQuery]=useState('');
 const [showPantryForm,setShowPantryForm]=useState(false),[editingPantry,setEditingPantry]=useState<PantryItem|null>(null);
 const [showRecipeForm,setShowRecipeForm]=useState(false),[editingRecipe,setEditingRecipe]=useState<Recipe|null>(null);
 const [ingredientDrafts,setIngredientDrafts]=useState<IngredientDraft[]>([blankIngredient()]);
 const [planning,setPlanning]=useState<{date:string;type:MealType;recipeId:string}|null>(null);
 const [planRecipeId,setPlanRecipeId]=useState('');

 useEffect(()=>{load();const channel=supabase.channel('meals-'+household.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'pantry_items',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'recipes',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'recipe_ingredients',filter:'household_id=eq.'+household.id},()=>load(false))
  .on('postgres_changes',{event:'*',schema:'public',table:'meal_plan_entries',filter:'household_id=eq.'+household.id},()=>load(false))
  .subscribe();
  return()=>{supabase.removeChannel(channel)}
 },[household.id,week.getFullYear(),week.getMonth(),week.getDate()]);

 async function load(showLoader=true){
  if(showLoader)setLoading(true);setMessage('');
  const weekEnd=addDays(week,6);
  const [pantryR,recipeR,ingredientR,mealR]=await Promise.all([
   supabase.from('pantry_items').select('id,name,category,quantity,unit,minimum_quantity,location,expires_on,notes,active').eq('household_id',household.id).eq('active',true).order('name'),
   supabase.from('recipes').select('id,name,description,servings,prep_minutes,cook_minutes,instructions,notes,active').eq('household_id',household.id).eq('active',true).order('name'),
   supabase.from('recipe_ingredients').select('id,recipe_id,pantry_item_id,ingredient_name,quantity,unit,optional,sort_order').eq('household_id',household.id).order('sort_order'),
   supabase.from('meal_plan_entries').select('id,meal_date,meal_type,recipe_id,custom_title,servings,notes,status').eq('household_id',household.id).gte('meal_date',iso(week)).lte('meal_date',iso(weekEnd)).order('meal_date').order('meal_type')
  ]);
  setPantry((pantryR.data||[]) as PantryItem[]);setRecipes((recipeR.data||[]) as Recipe[]);setIngredients((ingredientR.data||[]) as Ingredient[]);setMeals((mealR.data||[]) as MealPlan[]);
  if(pantryR.error||recipeR.error||ingredientR.error||mealR.error)setMessage('No se pudo cargar toda la información de comidas.');
  if(showLoader)setLoading(false);
 }

 const weekDays=useMemo(()=>Array.from({length:7},(_,i)=>addDays(week,i)),[week]);
 const today=iso();
 const lowStock=useMemo(()=>pantry.filter(item=>Number(item.quantity)<=Number(item.minimum_quantity)),[pantry]);
 const expiringSoon=useMemo(()=>{const limit=iso(addDays(new Date(),7));return pantry.filter(item=>item.expires_on&&item.expires_on>=today&&item.expires_on<=limit)},[pantry,today]);
 const pantryMap=useMemo(()=>new Map(pantry.map(x=>[x.id,x])),[pantry]);

 function ingredientsFor(recipeId:string){return ingredients.filter(x=>x.recipe_id===recipeId)}
 function recipeById(id:string|null){return recipes.find(r=>r.id===id)||null}
 function mealAt(date:string,type:MealType){return meals.find(m=>m.meal_date===date&&m.meal_type===type)||null}

 function coverage(recipeId:string,servings?:number|null){
  const recipe=recipeById(recipeId);if(!recipe)return 0;
  const required=ingredientsFor(recipeId).filter(i=>!i.optional);
  if(!required.length)return 100;
  const ratio=(servings||recipe.servings)/recipe.servings;
  const available=required.filter(i=>i.pantry_item_id&&Number(pantryMap.get(i.pantry_item_id)?.quantity||0)>=Number(i.quantity)*ratio).length;
  return Math.round(available/required.length*100);
 }

 function startPantry(item:PantryItem|null=null){if(readOnly)return;setEditingPantry(item);setShowPantryForm(true)}
 function closePantry(){setEditingPantry(null);setShowPantryForm(false)}

 async function savePantry(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const payload={household_id:household.id,name:String(f.get('name')||'').trim(),category:String(f.get('category')||'other'),quantity:Number(f.get('quantity')||0),unit:String(f.get('unit')||'unidad').trim()||'unidad',minimum_quantity:Number(f.get('minimum_quantity')||0),location:String(f.get('location')||'pantry'),expires_on:String(f.get('expires_on')||'')||null,notes:String(f.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
  const result=editingPantry?await supabase.from('pantry_items').update(payload).eq('id',editingPantry.id).eq('household_id',household.id):await supabase.from('pantry_items').insert(payload);
  setBusy(false);setMessage(result.error?result.error.message:editingPantry?'Producto actualizado.':'Producto agregado a la despensa.');
  if(!result.error){closePantry();await load(false)}
 }

 async function changePantry(item:PantryItem,delta:number){
  if(readOnly){setMessage('Modo solo lectura.');return}
  const next=Math.max(0,Number(item.quantity)+delta);
  const {error}=await supabase.from('pantry_items').update({quantity:next,updated_at:new Date().toISOString()}).eq('id',item.id).eq('household_id',household.id);
  if(error)setMessage(error.message);else setPantry(current=>current.map(x=>x.id===item.id?{...x,quantity:next}:x));
 }

 async function archivePantry(item:PantryItem){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!window.confirm('¿Quitar este producto de la despensa?'))return;
  const {error}=await supabase.from('pantry_items').update({active:false,updated_at:new Date().toISOString()}).eq('id',item.id).eq('household_id',household.id);
  if(error)setMessage(error.message);else await load(false);
 }

 function startRecipe(recipe:Recipe|null=null){if(readOnly)return;
  setEditingRecipe(recipe);
  if(recipe){
   const drafts=ingredientsFor(recipe.id).map(i=>({ingredient_name:i.ingredient_name,quantity:String(Number(i.quantity)),unit:i.unit,pantry_item_id:i.pantry_item_id||'',optional:i.optional}));
   setIngredientDrafts(drafts.length?drafts:[blankIngredient()]);
  }else setIngredientDrafts([blankIngredient()]);
  setShowRecipeForm(true);
 }
 function closeRecipe(){setEditingRecipe(null);setShowRecipeForm(false);setIngredientDrafts([blankIngredient()])}

 async function saveRecipe(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const payload={household_id:household.id,name:String(f.get('name')||'').trim(),description:String(f.get('description')||'').trim()||null,servings:Number(f.get('servings')||2),prep_minutes:Number(f.get('prep_minutes')||0),cook_minutes:Number(f.get('cook_minutes')||0),instructions:String(f.get('instructions')||'').trim()||null,notes:String(f.get('notes')||'').trim()||null,updated_at:new Date().toISOString()};
  let recipeId=editingRecipe?.id||'';
  if(editingRecipe){
   const {error}=await supabase.from('recipes').update(payload).eq('id',editingRecipe.id).eq('household_id',household.id);
   if(error){setBusy(false);setMessage(error.message);return}
   await supabase.from('recipe_ingredients').delete().eq('recipe_id',editingRecipe.id).eq('household_id',household.id);
  }else{
   const {data,error}=await supabase.from('recipes').insert(payload).select('id').single();
   if(error||!data){setBusy(false);setMessage(error?.message||'No se pudo crear la receta.');return}
   recipeId=data.id;
  }
  const rows=ingredientDrafts.filter(i=>i.ingredient_name.trim()&&Number(i.quantity)>0).map((i,index)=>({recipe_id:recipeId,household_id:household.id,pantry_item_id:i.pantry_item_id||null,ingredient_name:i.ingredient_name.trim(),quantity:Number(i.quantity),unit:i.unit.trim()||'unidad',optional:i.optional,sort_order:index}));
  if(rows.length){const {error}=await supabase.from('recipe_ingredients').insert(rows);if(error){setBusy(false);setMessage(error.message);return}}
  setBusy(false);setMessage(editingRecipe?'Receta actualizada.':'Receta creada.');closeRecipe();await load(false);
 }

 async function archiveRecipe(recipe:Recipe){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(!window.confirm('¿Archivar esta receta? Los planes anteriores se conservarán.'))return;
  const {error}=await supabase.from('recipes').update({active:false,updated_at:new Date().toISOString()}).eq('id',recipe.id).eq('household_id',household.id);
  if(error)setMessage(error.message);else await load(false);
 }

 function openPlan(date:string,type:MealType,recipeId=''){if(readOnly)return;setPlanning({date,type,recipeId});setPlanRecipeId(recipeId)}
 async function savePlan(e:FormEvent<HTMLFormElement>){
  if(readOnly){setMessage('Modo solo lectura.');return}
  e.preventDefault();if(!planning)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  const recipeId=String(f.get('recipe_id')||'')||null,customTitle=String(f.get('custom_title')||'').trim()||null;
  if(!recipeId&&!customTitle){setBusy(false);setMessage('Selecciona una receta o escribe una comida.');return}
  const recipe=recipeId?recipeById(recipeId):null;
  const payload={household_id:household.id,meal_date:planning.date,meal_type:planning.type,recipe_id:recipeId,custom_title:recipeId?null:customTitle,servings:Number(f.get('servings')||recipe?.servings||2),notes:String(f.get('notes')||'').trim()||null,status:'planned',completed_at:null,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('meal_plan_entries').upsert(payload,{onConflict:'household_id,meal_date,meal_type'});
  setBusy(false);setMessage(error?error.message:'Comida agregada al plan.');if(!error){setPlanning(null);setPlanRecipeId('');await load(false)}
 }

 async function deleteMeal(meal:MealPlan){
  if(readOnly){setMessage('Modo solo lectura.');return}
  const {error}=await supabase.from('meal_plan_entries').delete().eq('id',meal.id).eq('household_id',household.id);
  if(error)setMessage(error.message);else await load(false);
 }

 async function completeMeal(meal:MealPlan){
  if(readOnly){setMessage('Modo solo lectura.');return}
  if(meal.status==='prepared')return;
  setBusy(true);const {error}=await supabase.rpc('complete_meal_plan',{p_entry_id:meal.id});setBusy(false);
  setMessage(error?error.message:'Comida marcada como preparada y despensa actualizada.');if(!error)await load(false);
 }

 async function ensureShoppingList(){
  if(readOnly)throw new Error('Modo solo lectura.');
  const {data:existing}=await supabase.from('lists').select('id,title').eq('household_id',household.id).eq('list_type','shopping').order('created_at').limit(1).maybeSingle();
  if(existing?.id)return existing.id as string;
  const {data,error}=await supabase.from('lists').insert({household_id:household.id,title:'Supermercado',list_type:'shopping'}).select('id').single();
  if(error||!data)throw new Error(error?.message||'No se pudo crear la lista de compras.');
  return data.id as string;
 }

 async function addRecipeMissingToShopping(recipe:Recipe,servings?:number|null){
  if(readOnly){setMessage('Modo solo lectura.');return}
  setBusy(true);setMessage('');
  try{
   const listId=await ensureShoppingList(),ratio=(servings||recipe.servings)/recipe.servings;
   const required=ingredientsFor(recipe.id).filter(i=>!i.optional);
   const {data:existing}=await supabase.from('list_items').select('text,source_pantry_item_id,source_recipe_id').eq('list_id',listId).eq('household_id',household.id).eq('completed',false);
   const existingKeys=new Set((existing||[]).map((x:any)=>x.source_pantry_item_id?'p:'+x.source_pantry_item_id:'t:'+String(x.text).toLocaleLowerCase('es-GT')));
   const rows=required.flatMap(i=>{
    const need=Number(i.quantity)*ratio,available=i.pantry_item_id?Number(pantryMap.get(i.pantry_item_id)?.quantity||0):0,missing=Math.max(0,need-available);
    const key=i.pantry_item_id?'p:'+i.pantry_item_id:'t:'+i.ingredient_name.toLocaleLowerCase('es-GT');
    if(missing<=0||existingKeys.has(key))return[];
    return[{household_id:household.id,list_id:listId,text:i.ingredient_name,quantity:fmtQty(missing)+' '+i.unit,notes:'Desde receta: '+recipe.name,source_pantry_item_id:i.pantry_item_id||null,source_recipe_id:recipe.id}];
   });
   if(rows.length){const {error}=await supabase.from('list_items').insert(rows);if(error)throw error}
   setMessage(rows.length?rows.length+' faltante'+(rows.length===1?' agregado':'s agregados')+' a Supermercado.':'Ya tienes todo lo necesario o los faltantes ya están en la lista.');
  }catch(error:any){setMessage(error?.message||'No se pudieron agregar los faltantes.')}
  setBusy(false);
 }

 async function addPantryToShopping(item:PantryItem){
  if(readOnly){setMessage('Modo solo lectura.');return}
  setBusy(true);setMessage('');
  try{
   const listId=await ensureShoppingList();
   const {data:existing}=await supabase.from('list_items').select('id').eq('list_id',listId).eq('household_id',household.id).eq('completed',false).eq('source_pantry_item_id',item.id).limit(1).maybeSingle();
   if(existing?.id){setMessage(item.name+' ya está en la lista de compras.');setBusy(false);return}
   const shortfall=Math.max(1,Number(item.minimum_quantity)-Number(item.quantity));
   const {error}=await supabase.from('list_items').insert({household_id:household.id,list_id:listId,text:item.name,quantity:fmtQty(shortfall)+' '+item.unit,notes:'Reposición de despensa',source_pantry_item_id:item.id});
   if(error)throw error;setMessage(item.name+' agregado a Supermercado.');
  }catch(error:any){setMessage(error?.message||'No se pudo agregar el producto.')}
  setBusy(false);
 }

 const recipeFiltered=useMemo(()=>{const n=query.trim().toLocaleLowerCase('es-GT');return recipes.filter(r=>!n||[r.name,r.description,r.notes].filter(Boolean).some(v=>String(v).toLocaleLowerCase('es-GT').includes(n)))},[recipes,query]);
 const pantryFiltered=useMemo(()=>{const n=query.trim().toLocaleLowerCase('es-GT');return pantry.filter(p=>!n||[p.name,p.category,p.location,p.notes].filter(Boolean).some(v=>String(v).toLocaleLowerCase('es-GT').includes(n)))},[pantry,query]);

 if(loading)return <ModuleLoading/>;

 return <section className="meals-center">
  <div className="finance-top"><WorkspaceTitle module="meals" eyebrow="COCINA Y HOGAR" title="Comidas" description="Plan semanal, recetas, despensa y compras conectadas entre sí."/>{!readOnly&&<button className="finance-new" onClick={()=>tab==='planner'?openPlan(today,'dinner'):tab==='recipes'?startRecipe():startPantry()}><Plus/>{tab==='planner'?'Planificar':tab==='recipes'?'Receta':'Producto'}</button>}</div>

  <div className="meals-tabs"><button className={tab==='planner'?'active':''} onClick={()=>setTab('planner')}><ModuleIcon name="calendar"/> Plan semanal</button><button className={tab==='recipes'?'active':''} onClick={()=>setTab('recipes')}><ModuleIcon name="meals"/> Recetas</button><button className={tab==='pantry'?'active':''} onClick={()=>setTab('pantry')}><Package/> Despensa</button></div>
  {message&&<div className="finance-message">{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}

  {tab==='planner'&&<>
   <div className="meal-week-head"><button aria-label="Semana anterior" onClick={()=>setWeek(w=>addDays(w,-7))}><ChevronLeft/></button><div><small>SEMANA</small><strong>{fmtDate(iso(week))} — {fmtDate(iso(addDays(week,6)))}</strong></div><button aria-label="Semana siguiente" onClick={()=>setWeek(w=>addDays(w,7))}><ChevronRight/></button></div>
   <div className="meal-overview-kpis"><div><span><ModuleIcon name="calendar"/></span><small>Comidas planificadas</small><strong>{meals.filter(m=>m.status==='planned').length}</strong></div><div><span><CheckCircle2/></span><small>Preparadas</small><strong>{meals.filter(m=>m.status==='prepared').length}</strong></div><div><span><ShoppingCart/></span><small>Stock bajo</small><strong>{lowStock.length}</strong></div><div><span><Clock3/></span><small>Vencen en 7 días</small><strong>{expiringSoon.length}</strong></div></div>

   <div className="meal-week-grid">{weekDays.map(day=>{const date=iso(day),isToday=date===today;return <article className={'meal-day '+(isToday?'today':'')} key={date}><div className="meal-day-head"><small>{day.toLocaleDateString('es-GT',{weekday:'short'}).replace('.','')}</small><strong>{day.getDate()}</strong><span>{day.toLocaleDateString('es-GT',{month:'short'}).replace('.','')}</span></div><div className="meal-slots">{mealTypes.map(mt=>{const meal=mealAt(date,mt.id),recipe=meal?.recipe_id?recipeById(meal.recipe_id):null;return <div className={'meal-slot '+(meal?.status||'empty')} key={mt.id}><div className="meal-slot-title"><span>{mt.label}</span>{meal&&meal.status==='prepared'&&<Check/>}</div>{meal?<><strong>{recipe?.name||meal.custom_title}</strong>{recipe&&<small>{coverage(recipe.id,meal.servings)}% disponible · {meal.servings||recipe.servings} porciones</small>}<div className="meal-slot-actions">{!readOnly&&recipe&&meal.status==='planned'&&<button title="Agregar faltantes" onClick={()=>addRecipeMissingToShopping(recipe,meal.servings)}><ShoppingCart/></button>}{!readOnly&&meal.status==='planned'&&<button title="Marcar preparada" onClick={()=>completeMeal(meal)}><Check/></button>}{!readOnly&&<button title="Quitar" onClick={()=>deleteMeal(meal)}><Trash2/></button>}</div></>:(!readOnly&&<button className="meal-add-slot" onClick={()=>openPlan(date,mt.id)}><Plus/> Agregar</button>)}</div>})}</div></article>})}</div>

   <div className="meal-smart-row">
    <div className="meal-smart-card"><span><ShoppingCart/></span><div><strong>{lowStock.length?lowStock.length+' producto'+(lowStock.length===1?'':'s')+' con stock bajo':'Despensa abastecida'}</strong><small>{lowStock.length?'Agrega reposiciones directamente a Supermercado.':'No hay productos por debajo del mínimo configurado.'}</small></div><button onClick={()=>setTab('pantry')}>Revisar <ChevronRight/></button></div>
    <div className="meal-smart-card"><span><ModuleIcon name="meals"/></span><div><strong>{recipes.length} receta{recipes.length===1?'':'s'} guardada{recipes.length===1?'':'s'}</strong><small>Planifica la semana y Nuestro Hogar calcula qué ingredientes faltan.</small></div><button onClick={()=>setTab('recipes')}>Ver recetas <ChevronRight/></button></div>
   </div>
  </>}

  {tab==='recipes'&&<>
   <div className="meal-search-row"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar recetas"/></label>{!readOnly&&<button onClick={()=>startRecipe()}><Plus/> Nueva receta</button>}</div>
   <div className="recipe-grid">{recipeFiltered.map(recipe=>{const cov=coverage(recipe.id),ings=ingredientsFor(recipe.id);return <article className="recipe-card" key={recipe.id}><RecipePhoto key={household.id+recipe.id} householdId={household.id} recipeId={recipe.id} name={recipe.name}/><div className="recipe-card-head"><span><ModuleIcon name="meals"/></span><div><strong>{recipe.name}</strong><small>{recipe.prep_minutes+recipe.cook_minutes} min · {recipe.servings} porciones</small></div><b className={cov>=80?'good':cov>=50?'watch':'bad'}>{cov}%</b></div>{recipe.description&&<p>{recipe.description}</p>}<div className="recipe-stock"><div><span>Ingredientes disponibles</span><strong>{cov}%</strong></div><div className="progress"><span style={{width:cov+'%'}}/></div><small>{ings.filter(i=>!i.optional).length} ingrediente{ings.filter(i=>!i.optional).length===1?'':'s'} requeridos</small></div>{!readOnly&&<div className="recipe-actions"><button onClick={()=>{openPlan(today,'dinner',recipe.id);setTab('planner')}}><ModuleIcon name="calendar"/> Planificar</button><button onClick={()=>addRecipeMissingToShopping(recipe)}><ShoppingCart/> Faltantes</button><button onClick={()=>startRecipe(recipe)}><ModuleIcon name="meals"/> Editar</button><button className="danger" onClick={()=>archiveRecipe(recipe)}><Trash2/></button></div>}</article>})}</div>
   {!recipeFiltered.length&&<div className="document-empty"><ModuleIcon name="meals"/><strong>{recipes.length?'No encontramos recetas':'Aún no hay recetas'}</strong><span>{recipes.length?'Prueba con otra búsqueda.':'Crea una receta y vincula sus ingredientes con la despensa.'}</span>{!recipes.length&&!readOnly&&<button onClick={()=>startRecipe()}><Plus/> Crear primera receta</button>}</div>}
  </>}

  {tab==='pantry'&&<>
   <div className="meal-search-row"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar en despensa"/></label>{!readOnly&&<button onClick={()=>startPantry()}><Plus/> Producto</button>}</div>
   {(lowStock.length>0||expiringSoon.length>0)&&<div className="pantry-alerts">{lowStock.length>0&&<div><ShoppingCart/><strong>{lowStock.length} con stock bajo</strong><span>Conviene reponerlos pronto.</span></div>}{expiringSoon.length>0&&<div><Clock3/><strong>{expiringSoon.length} por vencer</strong><span>Úsalos antes de comprar más.</span></div>}</div>}
   <div className="pantry-grid">{pantryFiltered.map(item=>{const low=Number(item.quantity)<=Number(item.minimum_quantity),expired=Boolean(item.expires_on&&item.expires_on<today);return <article className={'pantry-card '+(low?'low ':'')+(expired?'expired':'')} key={item.id}><div className="pantry-card-head"><span><Package/></span><div><small>{pantryCategoryLabel(item.category)} · {pantryLocationLabel(item.location)}</small><strong>{item.name}</strong></div>{!readOnly&&<button onClick={()=>startPantry(item)}><ModuleIcon name="meals"/></button>}</div><div className="pantry-quantity">{!readOnly&&<button onClick={()=>changePantry(item,-1)}><Minus/></button>}<div><strong>{fmtQty(Number(item.quantity))}</strong><span>{item.unit}</span></div>{!readOnly&&<button onClick={()=>changePantry(item,1)}><Plus/></button>}</div><div className="pantry-meta"><span>Mínimo <b>{fmtQty(Number(item.minimum_quantity))} {item.unit}</b></span><span>{item.expires_on?'Vence '+fmtDate(item.expires_on):'Sin vencimiento'}</span></div>{low&&!readOnly&&<button className="pantry-buy" onClick={()=>addPantryToShopping(item)}><ShoppingCart/> Agregar a Supermercado</button>}{!readOnly&&<div className="pantry-card-actions"><button onClick={()=>startPantry(item)}>Editar</button><button className="danger" onClick={()=>archivePantry(item)}><Trash2/> Quitar</button></div>}</article>})}</div>
   {!pantryFiltered.length&&<div className="document-empty"><Package/><strong>{pantry.length?'No encontramos productos':'Despensa vacía'}</strong><span>{pantry.length?'Prueba con otra búsqueda.':'Registra lo que ya tienen en casa para evitar compras duplicadas.'}</span>{!pantry.length&&!readOnly&&<button onClick={()=>startPantry()}><Plus/> Agregar primer producto</button>}</div>}
  </>}

  {showPantryForm&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closePantry()}}><div className="finance-modal"><div className="modal-head"><h3>{editingPantry?'Editar producto':'Nuevo producto'}</h3><button onClick={closePantry}><X/></button></div><form className="finance-form" onSubmit={savePantry}>
   <label>Producto<input name="name" defaultValue={editingPantry?.name||''} placeholder="Ej. Arroz" required/></label>
   <div className="two"><label>Categoría<select name="category" defaultValue={editingPantry?.category||'other'}>{pantryCategories.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label>Ubicación<select name="location" defaultValue={editingPantry?.location||'pantry'}>{pantryLocations.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label></div>
   <div className="three"><label>Cantidad<input name="quantity" type="number" min="0" step=".01" defaultValue={editingPantry?Number(editingPantry.quantity):1}/></label><label>Unidad<input name="unit" defaultValue={editingPantry?.unit||'unidad'} placeholder="kg, lb, unidad"/></label><label>Mínimo<input name="minimum_quantity" type="number" min="0" step=".01" defaultValue={editingPantry?Number(editingPantry.minimum_quantity):0}/></label></div>
   <label>Vencimiento<input name="expires_on" type="date" defaultValue={editingPantry?.expires_on||''}/></label>
   <label>Notas<input name="notes" defaultValue={editingPantry?.notes||''} placeholder="Marca, tamaño o detalle opcional"/></label>
   <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':'Guardar producto'}</button>
  </form></div></div>}

  {showRecipeForm&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeRecipe()}}><div className="finance-modal recipe-modal"><div className="modal-head"><h3>{editingRecipe?'Editar receta':'Nueva receta'}</h3><button onClick={closeRecipe}><X/></button></div><form className="finance-form" onSubmit={saveRecipe}>
   <label>Nombre<input name="name" defaultValue={editingRecipe?.name||''} placeholder="Ej. Pollo parmesano" required/></label>
   <label>Descripción<input name="description" defaultValue={editingRecipe?.description||''} placeholder="Descripción corta"/></label>
   <div className="three"><label>Porciones<input name="servings" type="number" min="1" max="100" defaultValue={editingRecipe?.servings||2}/></label><label>Preparación min<input name="prep_minutes" type="number" min="0" defaultValue={editingRecipe?.prep_minutes||0}/></label><label>Cocción min<input name="cook_minutes" type="number" min="0" defaultValue={editingRecipe?.cook_minutes||0}/></label></div>
   <div className="recipe-ingredients-editor"><div className="recipe-ingredients-title"><div><strong>Ingredientes</strong><small>Vincularlos con la despensa permite calcular faltantes.</small></div><button type="button" onClick={()=>setIngredientDrafts([...ingredientDrafts,blankIngredient()])}><Plus/> Ingrediente</button></div>{ingredientDrafts.map((ingredient,index)=><div className="ingredient-edit-row" key={index}><input value={ingredient.ingredient_name} onChange={e=>updateIngredient(setIngredientDrafts,ingredientDrafts,index,{ingredient_name:e.target.value})} placeholder="Ingrediente"/><input type="number" min=".01" step=".01" value={ingredient.quantity} onChange={e=>updateIngredient(setIngredientDrafts,ingredientDrafts,index,{quantity:e.target.value})}/><input value={ingredient.unit} onChange={e=>updateIngredient(setIngredientDrafts,ingredientDrafts,index,{unit:e.target.value})} placeholder="unidad"/><select value={ingredient.pantry_item_id} onChange={e=>updateIngredient(setIngredientDrafts,ingredientDrafts,index,{pantry_item_id:e.target.value})}><option value="">Sin vincular</option>{pantry.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label className="ingredient-optional"><input type="checkbox" checked={ingredient.optional} onChange={e=>updateIngredient(setIngredientDrafts,ingredientDrafts,index,{optional:e.target.checked})}/> Opc.</label><button type="button" className="ingredient-remove" onClick={()=>setIngredientDrafts(ingredientDrafts.filter((_,i)=>i!==index))}><Trash2/></button></div>)}</div>
   <label>Preparación<textarea name="instructions" rows={5} defaultValue={editingRecipe?.instructions||''} placeholder="Pasos de preparación"/></label>
   <label>Notas<input name="notes" defaultValue={editingRecipe?.notes||''} placeholder="Opcional"/></label>
   <button className="finance-primary" disabled={busy}><Check/>{busy?'Guardando...':editingRecipe?'Guardar receta':'Crear receta'}</button>
  </form></div></div>}

  {planning&&!readOnly&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPlanning(null)}}><div className="finance-modal"><div className="modal-head"><div><p className="eyebrow">{mealTypeLabel(planning.type)} · {fmtDate(planning.date)}</p><h3>Planificar comida</h3></div><button onClick={()=>setPlanning(null)}><X/></button></div><form className="finance-form" onSubmit={savePlan}>
   <label>Receta<select name="recipe_id" value={planRecipeId} onChange={e=>setPlanRecipeId(e.target.value)}><option value="">Comida libre / sin receta</option>{recipes.map(r=><option key={r.id} value={r.id}>{r.name} · {coverage(r.id)}% disponible</option>)}</select></label>
   {!planRecipeId&&<label>Nombre de la comida<input name="custom_title" placeholder="Ej. Cena fuera de casa" required/></label>}
   <div className="two"><label>Porciones<input name="servings" type="number" min="1" defaultValue={recipeById(planRecipeId)?.servings||2}/></label><label>Fecha<input value={planning.date} disabled/></label></div>
   <label>Notas<input name="notes" placeholder="Opcional"/></label>
   <button className="finance-primary" disabled={busy}><ModuleIcon name="calendar"/>{busy?'Guardando...':'Agregar al plan'}</button>
  </form></div></div>}
 </section>
}

function blankIngredient():IngredientDraft{return{ingredient_name:'',quantity:'1',unit:'unidad',pantry_item_id:'',optional:false}}
function updateIngredient(setter:(v:IngredientDraft[])=>void,current:IngredientDraft[],index:number,patch:Partial<IngredientDraft>){setter(current.map((row,i)=>i===index?{...row,...patch}:row))}
