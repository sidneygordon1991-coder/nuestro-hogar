// Read-only catalog check. Never queries household records, runs migrations or changes project settings.
const project = process.env.SUPABASE_PROJECT_ID;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!/^[a-z0-9]{20}$/.test(project || '') || !token) {
  console.error('Define SUPABASE_PROJECT_ID y SUPABASE_ACCESS_TOKEN en el entorno seguro.');
  process.exit(1);
}
if (project === 'dchihxrjtngwabbvsqap' && !process.argv.includes('--production-read-only')) {
  console.error(
    'Este comando espera un proyecto de pruebas. Para revisar solo el catálogo de producción, usa --production-read-only.'
  );
  process.exit(1);
}
const query = `
with required_tables(name) as (values ('households'),('household_members'),('transactions'),('budget_categories'),('goal_contributions'),('finance_accounts'),('finance_transfers'),('account_reconciliations'),('finance_income_plans'),('household_audit_log'),('monthly_household_closures')),
tables as (
 select r.name, c.oid is not null as present, coalesce(c.relrowsecurity,false) as rls,
 (select count(*) from pg_policy p where p.polrelid=c.oid) as policies
 from required_tables r left join pg_namespace n on n.nspname='public'
 left join pg_class c on c.relnamespace=n.oid and c.relname=r.name and c.relkind='r'
), required_functions(name) as (values ('get_home_finance_source'),('get_account_book_state'),('confirm_account_reconciliation'),('get_my_household_access'),('build_monthly_household_close'),('finalize_monthly_household_close'),('log_client_error')),
functions as (
 select r.name, count(p.oid)>0 as present,
 coalesce(bool_or(has_function_privilege('anon',p.oid,'EXECUTE')),false) as anonymous_execute
 from required_functions r left join pg_namespace n on n.nspname='public'
 left join pg_proc p on p.pronamespace=n.oid and p.proname=r.name group by r.name
)
select jsonb_build_object('tables',(select jsonb_agg(to_jsonb(t) order by t.name) from tables t),
'functions',(select jsonb_agg(to_jsonb(f) order by f.name) from functions f)) as result;
`;
try {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query/read-only`, {
    method: 'POST',
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify({query}),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error('No se pudo revisar el catálogo (HTTP ' + response.status + ').');
  const data = await response.json();
  const result = data?.[0]?.result;
  if (!Array.isArray(result?.tables) || !Array.isArray(result?.functions))
    throw new Error('Respuesta de catálogo incompleta.');
  const findings = [
    ...result.tables
      .filter(t => !t.present || !t.rls || Number(t.policies) === 0)
      .map(t => ({kind: 'table', name: t.name, present: t.present, rls: t.rls, policies: t.policies})),
    ...result.functions.filter(f => !f.present || f.anonymous_execute).map(f => ({kind: 'function', ...f}))
  ];
  console.log(
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        mode: 'read-only',
        project,
        tables_checked: result.tables.length,
        functions_checked: result.functions.length,
        findings,
        passed: findings.length === 0
      },
      null,
      2
    )
  );
  if (findings.length) process.exitCode = 1;
} catch (error) {
  // Only our generic errors are printed. Never include response bodies, SQL function definitions or credentials.
  console.error(
    error instanceof Error && (error.message.startsWith('No se pudo') || error.message.startsWith('Respuesta'))
      ? error.message
      : 'La comprobación no terminó. Revisa el acceso y la conexión.'
  );
  process.exitCode = 1;
}
