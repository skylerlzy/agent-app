/** 结构化全程出行方案（对齐 travel-planner-ai 展示模型 + 课程七段内容） */

export interface TripPlanActivity {
  itineraryItem: string;
  briefDescription: string;
}

export interface TripPlanDay {
  title: string;
  dateIso?: string;
  activities: {
    morning: TripPlanActivity[];
    afternoon: TripPlanActivity[];
    evening: TripPlanActivity[];
  };
}

export interface TripPlanPlace {
  name: string;
  coordinates?: { lat: number; lng: number };
}

export interface TripPlanDocument {
  version: 1;
  meta: {
    destination?: string;
    origin?: string;
    tripStart?: string;
    tripEnd?: string;
    routeLabel?: string;
  };
  overview: string;
  weatherTips: string;
  transport: string;
  themesAndPlaces: string[];
  itinerary: TripPlanDay[];
  foodAndBudget: string;
  tipsAndDisclaimer: string;
  citations?: string[];
  topPlacesToVisit: TripPlanPlace[];
  adventuresActivities?: string[];
  localCuisine?: string[];
  packingChecklist?: string[];
}

export interface RunDoneTravelOutput {
  chatReply: string;
  tripPlan: TripPlanDocument;
}
