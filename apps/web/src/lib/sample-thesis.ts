import type { ThesisPoint } from "@sovereign/shared";

export const SAMPLE_THESIS_POINTS: ThesisPoint[] = [
  {
    id: -1,
    text: "Revenue growth sustains above 15% YoY driven by core product demand",
    metric: "Revenue YoY",
    status: "PASS",
    current_value: "+18.2%",
    threshold: ">15%",
  },
  {
    id: -2,
    text: "Gross margin expansion holds as input costs normalize",
    metric: "Gross Margin",
    status: "RISK",
    current_value: "17.8%",
    threshold: ">20%",
  },
  {
    id: -3,
    text: "Balance sheet supports capex without dilutive equity raises",
    metric: "Net Debt / EBITDA",
    status: "PASS",
    current_value: "1.4x",
    threshold: "<2.5x",
  },
];
