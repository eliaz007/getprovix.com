import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGpa4Scale } from "@/lib/gpa";
import { requireAiApiAccess } from "@/lib/api-auth";
import { parseJsonWithSchema } from "@/lib/parse-request-json";
import type { CollegeFitResult } from "./collegefitresult";
import type { ParsedCredentials } from "./parsedcredentials";
import { withStrategyDefaults } from "./withstrategydefaults";

export function buildFallbackReport(credentials: ParsedCredentials): CollegeFitResult {
  console.warn(
    "[college-fit] Returning fallback mock data — Gemini API did not succeed.",
    {
      tier: credentials.tier,
      gpa: credentials.gpa,
      sat: credentials.sat,
      act: credentials.act,
      major: credentials.major,
    }
  );

  if (credentials.tier === "high") {
    return {
      summary: `With a ${credentials.gpa} GPA${credentials.sat ? ` and SAT ${credentials.sat}` : ""}, you're positioned for highly selective reach schools while targeting top public flagships for ${credentials.major}.`,
      reachSchools: [
        withStrategyDefaults(
          {
            name: "Cornell University",
            location: "Ithaca, NY",
            matchReason: `Your strong GPA${credentials.sat ? ` and ${credentials.sat} SAT` : ""} make Cornell a realistic reach for ${credentials.major} if your essays and rigor stand out.`,
            fitBadge: "Ivy Reach",
          },
          credentials,
          "reach"
        ),
        withStrategyDefaults(
          {
            name: "Duke University",
            location: "Durham, NC",
            matchReason: `You have the academic profile to compete at a top-20 school with a compelling ${credentials.major} narrative.`,
            fitBadge: "Top 20 Reach",
          },
          credentials,
          "reach"
        ),
      ],
      targetSchools: [
        withStrategyDefaults(
          {
            name: "University of Virginia",
            location: "Charlottesville, VA",
            matchReason: `Your credentials align well with UVA's competitive but achievable range for strong ${credentials.major} applicants.`,
            fitBadge: "Top Flagship",
          },
          credentials,
          "target"
        ),
        withStrategyDefaults(
          {
            name: "University of Michigan",
            location: "Ann Arbor, MI",
            matchReason: `You're a solid target candidate for Michigan's flagship programs given your GPA and testing.`,
            fitBadge: "Top Flagship",
          },
          credentials,
          "target"
        ),
      ],
      safetySchools: [
        withStrategyDefaults(
          {
            name: "Pennsylvania State University",
            location: "University Park, PA",
            matchReason: `Your stats exceed Penn State's typical middle range, making it a dependable safety for ${credentials.major}.`,
            fitBadge: "Strong State Uni",
          },
          credentials,
          "safety"
        ),
        withStrategyDefaults(
          {
            name: "University of Florida",
            location: "Gainesville, FL",
            matchReason: `You should be highly competitive here while still accessing a strong public ${credentials.major} pathway.`,
            fitBadge: "Likely Admit",
          },
          credentials,
          "safety"
        ),
      ],
    };
  }

  if (credentials.tier === "low") {
    return {
      summary: `With a ${credentials.gpa} GPA${credentials.sat ? ` and SAT ${credentials.sat}` : ""}, you should focus on accessible pathways — including community college transfer routes — while building toward a ${credentials.major} degree.`,
      reachSchools: [
        withStrategyDefaults(
          {
            name: "University of Texas at El Paso",
            location: "El Paso, TX",
            matchReason: `Your profile fits UTEP's flexible, test-optional admissions as an ambitious but reachable four-year option.`,
            fitBadge: "Test-Optional",
          },
          credentials,
          "reach"
        ),
        withStrategyDefaults(
          {
            name: "Eastern Michigan University",
            location: "Ypsilanti, MI",
            matchReason: `You can pursue ${credentials.major} here with admissions policies suited to your current academic record.`,
            fitBadge: "Regional Reach",
          },
          credentials,
          "reach"
        ),
      ],
      targetSchools: [
        withStrategyDefaults(
          {
            name: "Metropolitan State University",
            location: "Saint Paul, MN",
            matchReason: `This open-access university offers a direct path into ${credentials.major} without ultra-selective barriers.`,
            fitBadge: "Open Enrollment",
          },
          credentials,
          "target"
        ),
        withStrategyDefaults(
          {
            name: "Miami Dade College",
            location: "Miami, FL",
            matchReason: `You can start here affordably and transfer into a four-year ${credentials.major} program later.`,
            fitBadge: "Transfer Pathway",
          },
          credentials,
          "target"
        ),
      ],
      safetySchools: [
        withStrategyDefaults(
          {
            name: "Northern Virginia Community College",
            location: "Annandale, VA",
            matchReason: `NOVA provides a low-risk safety with strong transfer agreements to Virginia four-year schools.`,
            fitBadge: "CC → 4-Year",
          },
          credentials,
          "safety"
        ),
        withStrategyDefaults(
          {
            name: "Lone Star College",
            location: "The Woodlands, TX",
            matchReason: `You can begin your ${credentials.major} pathway here and transfer once your record strengthens.`,
            fitBadge: "CC → 4-Year",
          },
          credentials,
          "safety"
        ),
      ],
    };
  }

  return {
    summary: `With a ${credentials.gpa} GPA and interest in ${credentials.major}, you have a balanced set of state flagships, regional universities, and high-admit backups to explore${credentials.locationPreference !== "No preference" ? ` in ${credentials.locationPreference}` : ""}.`,
    reachSchools: [
      withStrategyDefaults(
        {
          name: "Pennsylvania State University",
          location: "University Park, PA",
          matchReason: `Penn State is a realistic reach for your GPA and testing profile in ${credentials.major}.`,
          fitBadge: "State Flagship Reach",
        },
        credentials,
        "reach"
      ),
      withStrategyDefaults(
        {
          name: "University of Georgia",
          location: "Athens, GA",
          matchReason: `Your credentials make UGA an ambitious but attainable flagship option.`,
          fitBadge: "Flagship Reach",
        },
        credentials,
        "reach"
      ),
    ],
    targetSchools: [
      withStrategyDefaults(
        {
          name: "University of Alabama",
          location: "Tuscaloosa, AL",
          matchReason: `You match Alabama's typical admit profile for ${credentials.major} applicants in your GPA range.`,
          fitBadge: "Regional Match",
        },
        credentials,
        "target"
      ),
      withStrategyDefaults(
        {
          name: "San Jose State University",
          location: "San Jose, CA",
          matchReason: `Your stats fit SJSU's competitive regional range for ${credentials.major}.`,
          fitBadge: "Regional Target",
        },
        credentials,
        "target"
      ),
    ],
    safetySchools: [
      withStrategyDefaults(
        {
          name: "Arizona State University",
          location: "Tempe, AZ",
          matchReason: `ASU offers high admit rates with solid ${credentials.major} pathways for your profile.`,
          fitBadge: "High Admit",
        },
        credentials,
        "safety"
      ),
      withStrategyDefaults(
        {
          name: "Grand Valley State University",
          location: "Allendale, MI",
          matchReason: `You should be a likely admit here while still pursuing ${credentials.major}.`,
          fitBadge: "Likely Admit",
        },
        credentials,
        "safety"
      ),
    ],
  };
}
