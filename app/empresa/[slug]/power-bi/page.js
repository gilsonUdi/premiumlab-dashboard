import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default function CompanyPowerBiRoute({ params }) {
  return <CompanyDashboardPage slug={params.slug} mode="power-bi" />
}
