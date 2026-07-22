export type MockArticle = {
  id: string;
  imageSeed: string;
  category: string;
  region: string;
  title: string;
  leftPercentage: number;
  centerPercentage: number;
  rightPercentage: number;
  sourcesCount: number;
};

export const mockArticles: MockArticle[] = [
  {
    id: "trump-iran-peace-proposal",
    imageSeed: "trump-iran-peace-proposal",
    category: "Politics",
    region: "United States",
    title: "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report",
    leftPercentage: 20,
    centerPercentage: 31,
    rightPercentage: 49,
    sourcesCount: 12,
  },
  {
    id: "grapes-superfood",
    imageSeed: "grapes-superfood",
    category: "Health",
    region: "United States",
    title:
      "Researchers Make Case for Grapes as a 'Superfood' After Review of Health Evidence",
    leftPercentage: 18,
    centerPercentage: 42,
    rightPercentage: 40,
    sourcesCount: 7,
  },
  {
    id: "cern-physics-hint",
    imageSeed: "cern-physics-hint",
    category: "Science",
    region: "Switzerland",
    title: "CERN Finds High-Significance Hint of Physics Beyond Standard Model",
    leftPercentage: 16,
    centerPercentage: 62,
    rightPercentage: 22,
    sourcesCount: 8,
  },
  {
    id: "brooklyn-rivera-dies",
    imageSeed: "brooklyn-rivera-dies",
    category: "World",
    region: "Nicaragua",
    title:
      "Indigenous Leader Brooklyn Rivera Dies in Nicaragua After Nearly 3 Years of Detention",
    leftPercentage: 54,
    centerPercentage: 28,
    rightPercentage: 18,
    sourcesCount: 63,
  },
  {
    id: "un-security-council-lebanon",
    imageSeed: "un-security-council-lebanon",
    category: "World",
    region: "Middle East",
    title:
      "UN Security Council to Hold Emergency Meeting as Israel Pushes Deeper into Lebanon",
    leftPercentage: 22,
    centerPercentage: 35,
    rightPercentage: 43,
    sourcesCount: 15,
  },
  {
    id: "oil-prices-dip-opec",
    imageSeed: "oil-prices-dip-opec",
    category: "Business",
    region: "Global",
    title: "Oil Prices Dip as OPEC+ Considers Output Increase Amid Weak Demand",
    leftPercentage: 25,
    centerPercentage: 50,
    rightPercentage: 25,
    sourcesCount: 11,
  },
  {
    id: "spacex-starship-test-flight",
    imageSeed: "spacex-starship-test-flight",
    category: "Technology",
    region: "United States",
    title: "SpaceX Launches Starship Test Flight in Milestone for Mars Program",
    leftPercentage: 12,
    centerPercentage: 45,
    rightPercentage: 43,
    sourcesCount: 9,
  },
  {
    id: "apple-ai-features",
    imageSeed: "apple-ai-features",
    category: "Business",
    region: "United States",
    title: "Apple Unveils AI-Powered Features Across iPhone, iPad and Mac",
    leftPercentage: 15,
    centerPercentage: 40,
    rightPercentage: 45,
    sourcesCount: 10,
  },
  {
    id: "climate-hottest-years",
    imageSeed: "climate-hottest-years",
    category: "Climate",
    region: "Global",
    title:
      "2025 on Track to Be Among Top 3 Hottest Years, EU Climate Service Says",
    leftPercentage: 33,
    centerPercentage: 34,
    rightPercentage: 33,
    sourcesCount: 14,
  },
  {
    id: "fed-holds-rates-steady",
    imageSeed: "fed-holds-rates-steady",
    category: "Economy",
    region: "United States",
    title:
      "Fed Holds Rates Steady, Signals Caution on Inflation and Growth Outlook",
    leftPercentage: 30,
    centerPercentage: 45,
    rightPercentage: 25,
    sourcesCount: 13,
  },
  {
    id: "real-madrid-champions-league",
    imageSeed: "real-madrid-champions-league",
    category: "Soccer",
    region: "Europe",
    title: "Real Madrid Win Champions League After Comeback Victory in Final",
    leftPercentage: 10,
    centerPercentage: 20,
    rightPercentage: 70,
    sourcesCount: 26,
  },
  {
    id: "wildfires-western-canada",
    imageSeed: "wildfires-western-canada",
    category: "Environment",
    region: "Canada",
    title: "Wildfires Force Thousands to Evacuate Across Western Canada",
    leftPercentage: 27,
    centerPercentage: 33,
    rightPercentage: 40,
    sourcesCount: 17,
  },
];
