import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default function CompanyDashboardRoute({ params }) {
  return <CompanyDashboardPage slug={params.slug} />
}
