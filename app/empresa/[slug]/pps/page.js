import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default async function CompanyPpsRoute({ params }) {
  const { slug } = await params
  return <CompanyDashboardPage slug={slug} mode="pps" />
}
