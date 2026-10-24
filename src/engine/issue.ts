// Problems reported during navigation ("lift kharab hai", "aage rasta band hai", "seedhi nahi chadh sakta"),
// understood offline from Hindi, Hinglish or English.
export type Issue = 'lift' | 'block' | 'stairs';

const LIFT = /lift|elevator|लिफ्ट|लिफ़्ट/;
const BAD =
  /kharab|khrab|kharaab|band|bnd|nahi chal|nhi chal|not working|broken|out of order|stuck|बंद|खराब|ख़राब|नहीं चल|chalu nahi|चालू नहीं/;
const STAIRS = /seedhi|sidhi|sidi|stairs|staircase|steps|सीढ़ी|सीढ़ियाँ|सीढ़ियां|wheelchair|व्हीलचेयर|chadh nahi|chad nahi|चढ़ नहीं/;
const BLOCK =
  /block|band|bnd|rukawat|construction|kaam chal|safai|cleaning|wet|geela|crowd|bheed|bhid|rasta nahi|jaam|बंद|रुकावट|भीड़|गीला|सफ़ाई|सफाई|रास्ता नहीं/;

export function classifyIssue(text: string): Issue | null {
  const s = text.toLowerCase();
  if (LIFT.test(s) && BAD.test(s)) return 'lift';
  if (STAIRS.test(s)) return 'stairs';
  if (BLOCK.test(s)) return 'block';
  return null;
}
