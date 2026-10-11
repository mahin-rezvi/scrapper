import "server-only";
import { neon } from "@neondatabase/serverless";
import { Agent } from "undici";

type DatabaseRow = Record<string, unknown>;

function getConnectionString() {
  const connectionString = process.env.DIU_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIU_DATABASE_URL must be configured for the Neon Routines database.");
  }
  return connectionString;
}

const sql = neon(getConnectionString(), {
  // Some Node runtimes prefer unreachable IPv6 routes even when IPv4 is available.
  fetchOptions: { dispatcher: new Agent({ connect: { family: 4 } }) },
});

export const db = {
  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values: unknown[] = []
  ): Promise<{ rows: Row[] }> {
    const rows = await sql.query(text, values as never) as Row[];
    return { rows };
  },
};
