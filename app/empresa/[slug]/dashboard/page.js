import CompanyDashboardPage from '@/components/company/CompanyDashboardPage'

export default async function CompanyDashboardRoute({ params }) {
  const { slug } = await params
  return <CompanyDashboardPage slug={slug} />
}
