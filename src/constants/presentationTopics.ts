/** Hierarchical presentation topics for multi-select + search (UI labels: English). */

export interface TopicSub {
  id: string;
  label: string;
  /** Space-separated tokens for search (lowercased when matching). */
  search: string;
}

export interface TopicCategory {
  id: string;
  label: string;
  subs: TopicSub[];
}

export function topicKey(categoryId: string, subId: string): string {
  return `${categoryId}:${subId}`;
}

/** Paired with free-text `presentation_topic_custom`. */
export const OTHER_TOPIC_KEY = topicKey('other', 'custom');

export const PRESENTATION_TOPIC_CATEGORIES: TopicCategory[] = [
  {
    id: 'biz',
    label: 'Business & Management',
    subs: [
      { id: 'pitch', label: 'Pitch / IR deck', search: 'pitch ir investor startup funding deck venture' },
      { id: 'sales', label: 'Sales & proposals', search: 'sales b2b proposal client customer' },
      { id: 'strategy', label: 'Strategy & exec update', search: 'strategy executive quarterly business review roadmap' },
      { id: 'marketing', label: 'Marketing & brand', search: 'marketing brand campaign growth content' },
      { id: 'finance', label: 'Finance & results', search: 'finance earnings budget revenue forecast accounting' },
    ],
  },
  {
    id: 'tech',
    label: 'Technology & Engineering',
    subs: [
      { id: 'ai', label: 'AI & machine learning', search: 'ai ml machine learning deep learning llm neural' },
      { id: 'product', label: 'Product & roadmap', search: 'product roadmap feature launch release pm' },
      { id: 'architecture', label: 'Systems & architecture', search: 'architecture system infrastructure security cloud devops' },
      { id: 'data', label: 'Data & analytics', search: 'data analytics bi dashboard sql warehouse' },
      { id: 'devrel', label: 'Tech talks & DevRel', search: 'devrel conference meetup open source technical talk' },
    ],
  },
  {
    id: 'edu',
    label: 'Education & Research',
    subs: [
      { id: 'thesis', label: 'Thesis & research defense', search: 'thesis dissertation defense phd academic research' },
      { id: 'lecture', label: 'Lecture & teaching', search: 'lecture teaching course classroom curriculum' },
      { id: 'workshop', label: 'Workshop & tutorial', search: 'workshop tutorial hands-on lab training' },
      { id: 'science', label: 'Science seminar', search: 'science seminar journal paper lab' },
    ],
  },
  {
    id: 'policy',
    label: 'Policy & Public Sector',
    subs: [
      { id: 'gov', label: 'Government & regulation', search: 'government regulation compliance policy legal' },
      { id: 'esg', label: 'ESG & sustainability', search: 'esg sustainability carbon climate sdgs net zero' },
      { id: 'urban', label: 'Urban & infrastructure', search: 'urban infrastructure city transport planning civic' },
      { id: 'healthpol', label: 'Public health policy', search: 'public health healthcare policy epidemiology' },
    ],
  },
  {
    id: 'creative',
    label: 'Design & Creative',
    subs: [
      { id: 'ux', label: 'UX / UI review', search: 'ux ui design figma prototype usability' },
      { id: 'media', label: 'Media & storytelling', search: 'media storytelling film video content creator' },
      { id: 'writing', label: 'Copy & content', search: 'copywriting content blog editorial messaging' },
    ],
  },
  {
    id: 'personal',
    label: 'Career & Personal',
    subs: [
      { id: 'interview', label: 'Interview & intro', search: 'interview elevator pitch introduction hiring job' },
      { id: 'leadership', label: 'Leadership & team', search: 'leadership team town hall manager culture' },
      { id: 'onboarding', label: 'Internal & onboarding', search: 'onboarding internal all hands company update' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    subs: [
      { id: 'custom', label: 'Custom (not listed)', search: 'other custom miscellaneous freeform' },
    ],
  },
];

const keyToLabel = new Map<string, string>();

for (const cat of PRESENTATION_TOPIC_CATEGORIES) {
  for (const sub of cat.subs) {
    keyToLabel.set(topicKey(cat.id, sub.id), `${cat.label} › ${sub.label}`);
  }
}

export function labelForTopicKey(key: string): string | null {
  return keyToLabel.get(key) ?? null;
}

/** Compact label for inline chips (subtopic title only). */
export function subLabelForTopicKey(key: string): string | null {
  const parts = key.split(':');
  if (parts.length < 2) return null;
  const [catId, subId] = parts;
  const cat = PRESENTATION_TOPIC_CATEGORIES.find((c) => c.id === catId);
  const sub = cat?.subs.find((s) => s.id === subId);
  return sub?.label ?? null;
}

export function normalizeTopicSearch(q: string): string {
  return q.trim().toLowerCase();
}
