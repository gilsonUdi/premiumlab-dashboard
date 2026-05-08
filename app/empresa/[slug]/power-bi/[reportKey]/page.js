import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default function CompanyPowerBiReportRoute({ params }) {
  return <CompanyDashboardPage slug={params.slug} mode="power-bi" powerBiReportKey={params.reportKey} />
}
