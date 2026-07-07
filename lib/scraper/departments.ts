/**
 * Confirmed department codes from §2 of the project brief.
 * Add more entries here to track additional departments.
 */

export interface DepartmentConfig {
  code: string;
  name: string;
}

export const DEPARTMENTS: DepartmentConfig[] = [
  { code: "eee", name: "Electrical & Electronic Engineering" },
  { code: "cis", name: "Computer & Information Science" },
  { code: "english", name: "English" },
  { code: "itm", name: "Innovation & Technology Management" },
  { code: "ds", name: "Data Science" },
  { code: "mct", name: "Multimedia & Creative Technology" },
  { code: "icted", name: "ICT in Education" },
  { code: "hall", name: "Hall Administration" },
  { code: "registrar", name: "Registrar's Office" },
];

export const BASE_URL = "https://webbackend.daffodilvarsity.edu.bd";

export function noticeListUrl(code: string): string {
  return `${BASE_URL}/department/${code}/notice`;
}

export function noticeDetailUrl(code: string, id: number): string {
  return `${BASE_URL}/department/${code}/notice-detail/${id}`;
}
