import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default function CompanyExternalDashboardRoute({ params }) {
  return <CompanyDashboardPage slug={params.slug} mode="external" />
}
