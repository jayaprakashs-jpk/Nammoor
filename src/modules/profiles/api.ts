import { sb, type Enums, type Tables } from "@/shared/lib/supabase";
import { getGraph } from "@/shared/lib/graphStore";
import type { Graph } from "@/shared/lib/graph";

export type Person = Tables<"persons">;
export type Contact = Tables<"person_contact">;
export type Education = Tables<"person_education">;
export type Occupation = Tables<"person_occupations">;
export type PrivateField = Tables<"person_private_fields">;
export type Role = Enums<"family_role_t">;

export interface Member {
  user_id: string;
  role: Role;
  name: string;
}

export interface PersonBundle {
  person: Person;
  contact: Contact | null;
  education: Education[];
  occupations: Occupation[];
  privateFields: PrivateField[];
  grants: { field: Enums<"private_field_t">; grantee_id: string }[];
  members: Member[];
  myRole: Role | null;
  graph: Graph;
}

/** Everything the profile screen needs, fetched in parallel. */
export async function loadPerson(id: string, userId: string, force = false): Promise<PersonBundle | null> {
  const db = sb();
  const { data: person, error } = await db.from("persons").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!person) return null;

  const [contact, education, occupations, privateFields, grants, members, graph] = await Promise.all([
    db.from("person_contact").select("*").eq("person_id", id).maybeSingle(),
    db.from("person_education").select("*").eq("person_id", id).order("year_completed"),
    db.from("person_occupations").select("*").eq("person_id", id).order("is_current", { ascending: false }),
    db.from("person_private_fields").select("*").eq("person_id", id),
    db.from("private_field_grants").select("field, grantee_id").eq("person_id", id),
    db.from("family_members").select("user_id, role, profiles!family_members_user_id_fkey(display_name)").eq("family_id", person.family_id),
    getGraph(person.family_id, force),
  ]);
  for (const r of [contact, education, occupations, privateFields, grants, members]) if (r.error) throw r.error;

  const memberList: Member[] = (members.data ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    name: m.profiles?.display_name || "Family member",
  }));

  return {
    person,
    contact: contact.data,
    education: education.data ?? [],
    occupations: occupations.data ?? [],
    privateFields: privateFields.data ?? [],
    grants: grants.data ?? [],
    members: memberList,
    myRole: memberList.find((m) => m.user_id === userId)?.role ?? null,
    graph,
  };
}

/** Mirrors app.can_edit_person() in SQL. The database still has the final say. */
export function canEdit(p: Person, role: Role | null, userId: string): boolean {
  if (role === "owner" || role === "admin") return true;
  return role === "editor" && (p.managed_by === userId || p.user_id === userId);
}

/** Mirrors app.owns_private(): the person themself, or the keeper if unclaimed. */
export function ownsPrivate(p: Person, userId: string): boolean {
  return p.user_id === userId || (!p.user_id && p.managed_by === userId);
}

/** RLS hides rows you can't edit, so an update can "succeed" on 0 rows. Catch that. */
export function assertUpdated(rows: unknown[] | null) {
  if (!rows || rows.length === 0) throw new Error("permission denied: you can't edit this person");
}
