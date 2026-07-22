export type SourceBreakdownRow = {
  name: string;
  bias: "left" | "center" | "right";
};

export type RelatedStory = {
  imageSeed: string;
  category: string;
  region: string;
  title: string;
  date: string;
  readTime: string;
};

export type MockArticleDetail = {
  category: string;
  region: string;
  title: string;
  author: string;
  date: string;
  readTime: string;
  imageSeed: string;
  imageCaption: string;
  body: string[];
  leftPercentage: number;
  centerPercentage: number;
  rightPercentage: number;
  totalSources: number;
  leftSourcesCount: number;
  centerSourcesCount: number;
  rightSourcesCount: number;
  aiSummaryGenerated: string;
  aiSummaryReadTime: string;
  aiSummaryBullets: string[];
  framingNote: string;
  topSources: SourceBreakdownRow[];
  relatedStories: RelatedStory[];
};

export const mockArticleDetails: Record<string, MockArticleDetail> = {
  "trump-iran-peace-proposal": {
    category: "Politics",
    region: "United States",
    title: "Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report",
    author: "David Morgan",
    date: "May 31, 2026",
    readTime: "12 min read",
    imageSeed: "trump-iran-peace-proposal",
    imageCaption:
      "President Donald Trump in the Cabinet Room at the White House, Washington, D.C., May 30, 2026. Photo: Andrew Harnik/Getty Images",
    body: [
      "The Trump administration has sent Iran a revised nuclear deal proposal that includes tougher terms on uranium enrichment and stronger verification measures, according to a report published Saturday.",
      "The new proposal, delivered through intermediaries in Oman, requires Iran to halt all uranium enrichment on its soil and ship its stockpile of enriched uranium out of the country. It also demands unrestricted access for international inspectors to all Iranian nuclear facilities, including military sites.",
      "“This is a take-it-or-leave-it proposal,” a senior administration official told the Wall Street Journal. “The President wants a deal, but he will not accept a weak agreement that puts America or our allies at risk.”",
      "Iran has not yet officially responded to the proposal. However, Iranian Foreign Minister Hossein Amir-Abdollahian said last week that any deal must respect Iran's right to peaceful nuclear energy and include the lifting of all U.S. sanctions.",
      "The revised proposal comes after several rounds of indirect talks between U.S. and Iranian officials failed to produce a breakthrough. The Trump administration has warned that if diplomacy fails, it is prepared to take other action to prevent Iran from obtaining a nuclear weapon.",
      "European allies have urged both sides to continue negotiations. “We believe diplomacy is still the best path forward,” said a spokesperson for the EU's foreign policy chief.",
      "Israel, which has long opposed the 2015 nuclear deal with Iran, praised the Trump administration's tougher stance. “This is the kind of leadership that was missing in the past,” said Israeli Prime Minister Benjamin Netanyahu in a statement.",
      "The fate of the proposal now rests with Iran, as global attention remains focused on whether a new nuclear agreement can be reached—or if tensions will escalate further.",
    ],
    leftPercentage: 20,
    centerPercentage: 31,
    rightPercentage: 49,
    totalSources: 12,
    leftSourcesCount: 2,
    centerSourcesCount: 4,
    rightSourcesCount: 6,
    aiSummaryGenerated: "May 31, 2026",
    aiSummaryReadTime: "3 min read",
    aiSummaryBullets: [
      "The Trump administration has sent Iran a revised nuclear deal proposal with tougher terms, including a complete halt to uranium enrichment and the removal of enriched uranium stockpiles.",
      "The proposal also demands unrestricted inspector access to all nuclear sites, including military facilities.",
      "Iran has not responded officially but says any deal must respect its right to peaceful nuclear energy and include sanctions relief.",
      "The U.S. warns it is prepared to take other action if diplomacy fails, while European allies urge continued negotiations.",
      "Israel supports the tougher stance, praising the administration's determination to prevent Iran from acquiring nuclear weapons.",
    ],
    framingNote:
      "Our analysis is based on the political leaning of the publication and how the story is framed. Sources are weighted by reliability and recency.",
    topSources: [
      { name: "Fox News", bias: "right" },
      { name: "The Wall Street Journal", bias: "center" },
      { name: "Reuters", bias: "center" },
      { name: "BBC", bias: "center" },
      { name: "CNN", bias: "left" },
      { name: "The New York Times", bias: "center" },
      { name: "The Washington Post", bias: "center" },
      { name: "Newsmax", bias: "right" },
    ],
    relatedStories: [
      {
        imageSeed: "iran-wont-negotiate",
        category: "World",
        region: "Middle East",
        title: "Iran Says It Will Not Negotiate Under 'Maximum Pressure'",
        date: "May 29, 2026",
        readTime: "8 min read",
      },
      {
        imageSeed: "bipartisan-diplomacy-iran",
        category: "Politics",
        region: "United States",
        title: "Bipartisan Group Urges Diplomacy With Iran",
        date: "May 26, 2026",
        readTime: "5 min read",
      },
      {
        imageSeed: "us-sanctions-iranian-entities",
        category: "Politics",
        region: "United States",
        title: "US Sanctions More Iranian Entities Over Nuclear Program",
        date: "May 28, 2026",
        readTime: "6 min read",
      },
      {
        imageSeed: "2015-iran-nuclear-deal",
        category: "Science",
        region: "Nuclear Policy",
        title: "What's in the 2015 Iran Nuclear Deal?",
        date: "May 25, 2026",
        readTime: "10 min read",
      },
      {
        imageSeed: "oman-us-iran-nuclear-talks",
        category: "World",
        region: "Middle East",
        title: "Oman Hosts Another Round of US-Iran Nuclear Talks",
        date: "May 27, 2026",
        readTime: "7 min read",
      },
      {
        imageSeed: "israel-red-line-iran-nuclear",
        category: "World",
        region: "Middle East",
        title: "Israel Reaffirms Red Line Over Iranian Nuclear Program",
        date: "May 24, 2026",
        readTime: "6 min read",
      },
    ],
  },
};
