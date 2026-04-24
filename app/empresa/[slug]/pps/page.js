import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default function CompanyPpsRoute({ params }) {
  return <CompanyDashboardPage slug={params.slug} mode="pps" />
}
