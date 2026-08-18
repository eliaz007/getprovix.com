import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/utils/supabase/server";

type CheckoutBody = {
  candidateId?: string;
  jobId?: string;
  applicationId?: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CheckoutBody;
    const candidateId = body.candidateId?.trim() ?? "";
    const jobId = body.jobId?.trim() ?? "";
    const applicationId = body.applicationId?.trim() ?? "";

    if (!candidateId || !jobId || !applicationId) {
      return NextResponse.json(
        { error: "candidateId, jobId, and applicationId are required." },
        { status: 400 }
      );
    }

    if (!isUuid(candidateId) || !isUuid(jobId) || !isUuid(applicationId)) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, employer_id")
      .eq("id", jobId)
      .eq("employer_id", user.id)
      .maybeSingle();

    if (jobError) {
      console.error("[checkout] job lookup failed:", jobError);
      return NextResponse.json(
        { error: "Could not verify job ownership." },
        { status: 500 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: application, error: applicationError } = await supabase
      .from("job_applications")
      .select("id, job_id, candidate_id, unlocked")
      .eq("id", applicationId)
      .eq("job_id", jobId)
      .eq("candidate_id", candidateId)
      .maybeSingle();

    if (applicationError) {
      console.error("[checkout] application lookup failed:", applicationError);
      return NextResponse.json(
        { error: "Could not verify application." },
        { status: 500 }
      );
    }

    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    if (application.unlocked) {
      return NextResponse.json(
        { error: "This candidate contact is already unlocked." },
        { status: 400 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const successUrl = `${appUrl}/dashboard?payment_success=true&application_id=${encodeURIComponent(applicationId)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 4900,
            product_data: {
              name: "Candidate Introduction Unlock",
              description: `Unlock contact details for ${job.title ?? "this role"}.`,
            },
          },
        },
      ],
      metadata: {
        candidateId,
        jobId,
        applicationId,
        employerId: user.id,
      },
      success_url: successUrl,
      cancel_url: `${appUrl}/dashboard?payment_canceled=true`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not create checkout session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[checkout] unexpected error:", error);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
