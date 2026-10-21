import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default async function CompanyPowerBiReportRoute({ params }) {
  const { slug, reportKey } = await params
  return <CompanyDashboardPage slug={slug} mode="power-bi" powerBiReportKey={reportKey} />
}
