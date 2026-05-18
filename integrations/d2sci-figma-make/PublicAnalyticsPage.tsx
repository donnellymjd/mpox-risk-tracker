import React from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Activity,
  BarChart3,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const TRACKER_URL = "https://donnellymjd.github.io/mpox-risk-tracker/";
const TRACKER_EMBED_URL = `${TRACKER_URL}embed-card.html`;

export function PublicAnalyticsPage() {
  const openTracker = () => {
    window.open(TRACKER_URL, "_blank", "noopener,noreferrer");
  };

  const openRepo = () => {
    window.open(
      "https://github.com/donnellymjd/mpox-risk-tracker",
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Public Data Tools | D2Sci</title>
        <meta
          name="description"
          content="D2Sci public analytics tools, including a regularly refreshed NYC mpox spread risk tracker built from public health data."
        />
        <meta property="og:title" content="D2Sci Public Data Tools" />
        <meta
          property="og:description"
          content="A live mpox spread risk tracker and public health analytics example from Donnelly Data Science LLC."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <section className="bg-brand-navy text-white py-16 px-4">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2 mb-6 text-sm">
              <ShieldCheck className="h-4 w-4 text-brand-teal" />
              Public health analytics
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-5">
              NYC Mpox Spread Risk Tracker
            </h1>
            <p className="text-xl opacity-90 mb-8 leading-relaxed">
              A D2Sci public data tool that turns NYC mpox case reporting into a
              regularly refreshed spread-risk signal, historical comparisons,
              and links to respected health resources.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-brand-teal hover:bg-brand-teal/90 text-white"
                onClick={openTracker}
              >
                Open Live Tracker
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white bg-brand-navy hover:bg-white hover:text-brand-navy"
                onClick={openRepo}
              >
                View Methodology
              </Button>
            </div>
          </div>

          <Card className="bg-white text-brand-navy shadow-2xl border-0 overflow-hidden">
            <CardContent className="p-0">
              <iframe
                title="NYC Mpox Spread Risk Tracker Preview"
                src={TRACKER_EMBED_URL}
                loading="lazy"
                className="w-full h-[320px] border-0 bg-white"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="brand-navy mb-4">What the tracker provides</h2>
            <p className="text-gray-700 max-w-3xl mx-auto">
              The tool is designed for public communication: transparent,
              regularly updated, and paired with health information from
              trusted, queer-positive sources.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="h-full bg-white hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <Activity className="h-10 w-10 brand-blue mb-4" />
                <h3 className="brand-navy mb-3">Current signal</h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  A spread-risk indicator summarizes the latest reporting window
                  and classifies the signal from very low through high.
                </p>
              </CardContent>
            </Card>

            <Card className="h-full bg-white hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <BarChart3 className="h-10 w-10 brand-teal mb-4" />
                <h3 className="brand-navy mb-3">Historical context</h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  Interactive charts let visitors compare years, inspect values
                  by date, and understand seasonal patterns in reported cases.
                </p>
              </CardContent>
            </Card>

            <Card className="h-full bg-white hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <RefreshCw className="h-10 w-10 brand-blue mb-4" />
                <h3 className="brand-navy mb-3">Automated updates</h3>
                <p className="text-gray-700 text-sm leading-relaxed">
                  The site rebuilds from public source data on a scheduled cloud
                  workflow, keeping the public page current without manual
                  notebook runs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="brand-navy mb-4">Built as a reusable public analytics pattern</h2>
          <p className="text-gray-700 mb-8">
            The mpox tracker demonstrates how D2Sci can turn public datasets into
            reliable, understandable tools for health communication, policy
            monitoring, and community-facing risk dashboards.
          </p>
          <Button
            size="lg"
            className="bg-brand-blue hover:bg-brand-blue/90 text-white"
            onClick={openTracker}
          >
            Launch Tracker
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
}
