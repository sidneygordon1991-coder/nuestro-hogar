// Finance: error state shared by Cuentas and Patrimonio.
import {AlertTriangle} from 'lucide-react';
import {useFinance} from '../useFinanceWorkspace';

export default function FinanceAccountsError() {
  const {tab, busy, accountDataError, assetDataError, load} = useFinance();
  return (
    <>
      {((tab === 'accounts' && accountDataError) || (tab === 'networth' && (accountDataError || assetDataError))) && (
        <div className="workspace-status error" role="alert">
          <AlertTriangle size={20} />
          <p>No pudimos verificar los saldos completos. Reintenta antes de usar estas cifras.</p>
          <button type="button" disabled={busy} onClick={() => load()}>
            Reintentar saldos
          </button>
        </div>
      )}
    </>
  );
}
