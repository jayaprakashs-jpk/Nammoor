// ISO 3166-2 codes. state_code drives regional relation names later
// (IN-TN gets Tamil Uravumurai by default).
export const INDIAN_STATES: [string, string][] = [
  ["IN-TN", "Tamil Nadu"], ["IN-PY", "Puducherry"], ["IN-KL", "Kerala"], ["IN-KA", "Karnataka"],
  ["IN-AP", "Andhra Pradesh"], ["IN-TG", "Telangana"], ["IN-MH", "Maharashtra"], ["IN-GA", "Goa"],
  ["IN-GJ", "Gujarat"], ["IN-RJ", "Rajasthan"], ["IN-MP", "Madhya Pradesh"], ["IN-CG", "Chhattisgarh"],
  ["IN-OD", "Odisha"], ["IN-WB", "West Bengal"], ["IN-BR", "Bihar"], ["IN-JH", "Jharkhand"],
  ["IN-UP", "Uttar Pradesh"], ["IN-UK", "Uttarakhand"], ["IN-HP", "Himachal Pradesh"], ["IN-PB", "Punjab"],
  ["IN-HR", "Haryana"], ["IN-DL", "Delhi"], ["IN-CH", "Chandigarh"], ["IN-JK", "Jammu and Kashmir"],
  ["IN-LA", "Ladakh"], ["IN-AS", "Assam"], ["IN-AR", "Arunachal Pradesh"], ["IN-ML", "Meghalaya"],
  ["IN-MN", "Manipur"], ["IN-MZ", "Mizoram"], ["IN-NL", "Nagaland"], ["IN-SK", "Sikkim"],
  ["IN-TR", "Tripura"], ["IN-AN", "Andaman and Nicobar"], ["IN-LD", "Lakshadweep"],
  ["IN-DH", "Dadra Nagar Haveli and Daman Diu"],
];

export const COUNTRIES: [string, string][] = [
  ["IN", "India"], ["LK", "Sri Lanka"], ["MY", "Malaysia"], ["SG", "Singapore"], ["AE", "UAE"],
  ["SA", "Saudi Arabia"], ["QA", "Qatar"], ["KW", "Kuwait"], ["OM", "Oman"], ["US", "USA"],
  ["GB", "UK"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"], ["DE", "Germany"],
  ["FR", "France"], ["MU", "Mauritius"], ["ZA", "South Africa"],
];

export const EDUCATION_LEVELS: [string, string][] = [
  ["school", "School"], ["iti", "ITI"], ["diploma", "Diploma"], ["ug", "Degree (UG)"],
  ["pg", "Post graduate (PG)"], ["doctorate", "Doctorate"], ["other", "Other"],
];

export const GENDERS: [string, string][] = [
  ["unknown", "Not set"], ["male", "Male · ஆண்"], ["female", "Female · பெண்"], ["other", "Other"],
];
