// Finance section: networth.
import {BarChart3, CircleDollarSign, Gauge, Gem, Pencil, Plus, Trash2, TrendingDown, TrendingUp} from 'lucide-react';
import {
  Progress,
  EmptyFinance,
  NetWorthChart,
  accountIcon,
  assetIcon,
  assetTypeName,
  accountTypeName,
  currency
} from '../../FinanceParts';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceNetworth() {
  const {
    tab,
    busy,
    accountDataError,
    assetDataError,
    assets,
    netWorthSnapshots,
    setShowAccountForm,
    setEditingAccount,
    setShowAssetForm,
    setEditingAsset,
    memberName,
    accountBalances,
    patrimony,
    deleteAsset,
    readOnly
  } = useFinance();
  return (
    <>
      {tab === 'networth' && !accountDataError && !assetDataError && (
        <>
          <div className={'net-worth-hero ' + (patrimony.netWorth < 0 ? 'negative' : '')}>
            <div>
              <p className="eyebrow">Patrimonio neto</p>
              <h3>{currency(patrimony.netWorth)}</h3>
              <p>Activos y cuentas menos deudas. Se actualiza automáticamente con movimientos y transferencias.</p>
            </div>
            <span className="net-worth-icon">
              <CircleDollarSign />
            </span>
          </div>
          <div className="net-worth-kpis">
            <div>
              <span className="asset">
                <TrendingUp />
              </span>
              <small>Activos totales</small>
              <strong>{currency(patrimony.totalAssets)}</strong>
              <em>{currency(patrimony.liquidAssets)} líquidos</em>
            </div>
            <div>
              <span className="liability">
                <TrendingDown />
              </span>
              <small>Deudas</small>
              <strong>{currency(patrimony.liabilities)}</strong>
              <em>{patrimony.debtRatio.toFixed(1)}% de activos</em>
            </div>
            <div>
              <span className="credit">
                <Gauge />
              </span>
              <small>Uso de crédito</small>
              <strong>{patrimony.creditLimit ? Math.round(patrimony.creditUtilization) + '%' : '—'}</strong>
              <em>
                {patrimony.creditLimit
                  ? currency(patrimony.creditUsed) + ' de ' + currency(patrimony.creditLimit)
                  : 'Sin límites configurados'}
              </em>
            </div>
            <div>
              <span className="manual">
                <Gem />
              </span>
              <small>Bienes registrados</small>
              <strong>{currency(patrimony.manualAssets)}</strong>
              <em>
                {assets.length} activo{assets.length === 1 ? '' : 's'}
              </em>
            </div>
          </div>

          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Evolución del patrimonio</h3>
                <small>Se guarda una fotografía diaria para construir el histórico real.</small>
              </div>
              <BarChart3 size={18} />
            </div>
            <NetWorthChart data={netWorthSnapshots} />
          </div>

          <div className="finance-columns patrimony-columns">
            <div className="finance-panel">
              <div className="panel-title">
                <div>
                  <h3>Activos financieros</h3>
                  <small>Cuentas, efectivo, ahorro e inversiones.</small>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => {
                      setEditingAccount(null);
                      setShowAccountForm(true);
                    }}
                  >
                    <Plus size={15} /> Cuenta
                  </button>
                )}
              </div>
              <div className="wealth-list">
                {accountBalances
                  .filter(a => a.account_class === 'asset')
                  .map(a => (
                    <div className="wealth-row" key={a.id}>
                      <span>{accountIcon(a.account_type)}</span>
                      <div>
                        <strong>{a.name}</strong>
                        <small>
                          {a.institution || accountTypeName(a.account_type)} · {a.is_shared ? 'Compartida' : 'Personal'}
                        </small>
                      </div>
                      <b>{currency(a.balance)}</b>
                    </div>
                  ))}
              </div>
              {!accountBalances.some(a => a.account_class === 'asset') && (
                <EmptyFinance text="Agrega una cuenta o inversión para comenzar a medir tus activos." />
              )}
            </div>
            <div className="finance-panel">
              <div className="panel-title">
                <div>
                  <h3>Deudas y tarjetas</h3>
                  <small>Saldo pendiente, utilización y próximas fechas.</small>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => {
                      setEditingAccount(null);
                      setShowAccountForm(true);
                    }}
                  >
                    <Plus size={15} /> Deuda
                  </button>
                )}
              </div>
              <div className="wealth-list">
                {accountBalances
                  .filter(a => a.account_class === 'liability')
                  .map(a => (
                    <div className="debt-summary-row" key={a.id}>
                      <div className="wealth-row">
                        <span>{accountIcon(a.account_type)}</span>
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            {a.institution || accountTypeName(a.account_type)}
                            {a.payment_due_day ? ' · paga día ' + a.payment_due_day : ''}
                          </small>
                        </div>
                        <b>{currency(Math.max(0, a.balance))}</b>
                      </div>
                      {a.account_type === 'credit' && a.credit_limit ? (
                        <div className="debt-utilization">
                          <div>
                            <span>Utilización</span>
                            <strong>{Math.round((Math.max(0, a.balance) / Number(a.credit_limit)) * 100)}%</strong>
                          </div>
                          <Progress value={(Math.max(0, a.balance) / Number(a.credit_limit)) * 100} />
                          <small>
                            {currency(Math.max(0, Number(a.credit_limit) - Math.max(0, a.balance)))} disponible
                          </small>
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>
              {!accountBalances.some(a => a.account_class === 'liability') && (
                <EmptyFinance text="Agrega tarjetas, préstamos o hipotecas para ver tu deuda total." />
              )}
            </div>
          </div>

          <div className="finance-panel">
            <div className="panel-title">
              <div>
                <h3>Bienes y otros activos</h3>
                <small>Casa, vehículo, inversiones externas y objetos de valor.</small>
              </div>
              {!readOnly && (
                <button
                  className="mini-add"
                  onClick={() => {
                    setEditingAsset(null);
                    setShowAssetForm(true);
                  }}
                >
                  <Plus size={15} /> Activo
                </button>
              )}
            </div>
            <div className="asset-grid">
              {assets.map(asset => (
                <article className="asset-card" key={asset.id}>
                  <span className={'asset-type-icon ' + asset.asset_type}>{assetIcon(asset.asset_type)}</span>
                  <div>
                    <small>{assetTypeName(asset.asset_type)}</small>
                    <strong>{asset.name}</strong>
                    <b>{currency(Number(asset.estimated_value))}</b>
                    <em>{asset.is_shared ? 'Del hogar' : memberName(asset.owner_user_id)}</em>
                  </div>
                  {!readOnly && (
                    <div className="asset-actions">
                      <button
                        type="button"
                        aria-label={'Editar activo ' + asset.name}
                        title="Editar"
                        onClick={() => {
                          setEditingAsset(asset);
                          setShowAssetForm(true);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={'Eliminar activo ' + asset.name}
                        title="Eliminar"
                        disabled={busy}
                        onClick={() => deleteAsset(asset)}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {!assets.length && (
              <EmptyFinance text="Registra bienes para tener una visión completa del patrimonio del hogar." />
            )}
          </div>
        </>
      )}
    </>
  );
}
