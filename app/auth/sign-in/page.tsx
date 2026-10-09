import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import AdminSignInForm from "@/app/auth/sign-in/AdminSignInForm";
import { auth } from "@/lib/auth/server";
import { isRoutineAdmin } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function AdminSignInPage() {
  const { data: session } = await auth.getSession();
  if (isRoutineAdmin(session?.user.email)) redirect("/routine/manage");

  return (
    <main className="product-page management-page">
      <div className="product-wrap">
        <SiteHeader />
        <section className="page-heading">
          <div><span className="eyebrow">Admin access</span><h1>Sign in to manage routines</h1><p>A one-time code will be sent to the authorized admin email.</p></div>
          <Link className="button button-outline" href="/routine">Back to routine search <span aria-hidden="true">↗</span></Link>
        </section>
        <AdminSignInForm />
      </div>
    </main>
  );
}
