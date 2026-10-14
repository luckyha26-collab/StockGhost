import { PageHeader } from '../components/ui.jsx'
import ImportWizard from '../components/ImportWizard.jsx'
import { useAuth } from '../context/AuthContext.jsx'

export default function DataImport() {
  const { loadWorkspace } = useAuth()
  return (
    <>
      <PageHeader title="Data Import Center" subtitle="Upload CSV or Excel files, map your columns, review the validation report and import. Everything you import stays inside your workspace." />
      <ImportWizard onDone={() => loadWorkspace()} />
    </>
  )
}
