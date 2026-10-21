import CompanyHomePage from '@/components/company/CompanyHomePage'

export default async function CompanyPage({ params }) {
  const { slug } = await params
  return <CompanyHomePage slug={slug} />
}
