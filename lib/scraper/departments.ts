/**
 * Department codes match DIU's current faculty directory and notice-board routes.
 * The additional entries cover ICT in Education and central student/admin boards.
 */

export interface DepartmentConfig {
  code: string;
  name: string;
}

export const DEPARTMENTS: DepartmentConfig[] = [
  { code: "accounting", name: "Accounting" },
  { code: "ags", name: "Agricultural Science" },
  { code: "architecture", name: "Architecture" },
  { code: "bba", name: "Business Administration" },
  { code: "bre", name: "Real Estate" },
  { code: "ce", name: "Civil Engineering" },
  { code: "cis", name: "Computing & Information System" },
  { code: "cse", name: "Computer Science & Engineering" },
  { code: "de", name: "Innovation & Entrepreneurship" },
  { code: "ds", name: "Development Studies" },
  { code: "eee", name: "Electrical & Electronic Engineering" },
  { code: "english", name: "English" },
  { code: "esdm", name: "Environmental Science & Disaster Management" },
  { code: "finance", name: "Finance & Banking" },
  { code: "fisheries", name: "Fisheries" },
  { code: "geb", name: "Genetic Engineering & Biotechnology" },
  { code: "hall", name: "DSC Hall" },
  { code: "ice", name: "Information & Communication Engineering" },
  { code: "icted", name: "ICT in Education" },
  { code: "itm", name: "Information Technology & Management" },
  { code: "jmc", name: "Journalism, Media & Communication" },
  { code: "law", name: "Law" },
  { code: "mct", name: "Multimedia & Creative Technology" },
  { code: "mgt", name: "Management" },
  { code: "mkt", name: "Marketing" },
  { code: "nfe", name: "Nutrition & Food Engineering" },
  { code: "ph", name: "Public Health" },
  { code: "pharmacy", name: "Pharmacy" },
  { code: "pess", name: "Physical Education & Sports Science" },
  { code: "registrar", name: "Registrar's Office" },
  { code: "rme", name: "Robotics & Mechatronics Engineering" },
  { code: "swe", name: "Software Engineering" },
  { code: "te", name: "Textile Engineering" },
  { code: "thm", name: "Tourism & Hospitality Management" },
];

export const BASE_URL = "https://webbackend.daffodilvarsity.edu.bd";

export function noticeListUrl(code: string, page?: number): string {
  const url = new URL(`${BASE_URL}/department/${code}/notice`);
  if (page && page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}

export function noticeDetailUrl(code: string, id: number): string {
  return `${BASE_URL}/department/${code}/notice-detail/${id}`;
}
