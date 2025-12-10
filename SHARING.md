# **Federated Notes App — Structure, Permissions, and Sharing Spec**

## **Status**:

**_Draft_**

# Please Approve or Edit

---

## **1. Core Design Invariants**

The system MUST obey the following rules at all times:

1.  Spaces define visibility
2.  Visibility has exactly one source
3.  Notes never define visibility
4.  Per-note permissions restrict actions only
5.  Structure never implies permission
6.  Permission never implies structure
7.  One space has exactly one authority(server in the federated system) of record

Any feature that violates one of these invariants is invalid.

---

## **2. Spaces**

### **2.1 Definition**

A **Space** is the only internal visibility and collaboration boundary.

### **2.2 Properties**

    Space
    - space_id
    - authority_id
    - members: Map<UserID, Role>
    - root_folder_id

### **2.3 Rules**

- Every space has exactly one authority of record
- Spaces cannot be nested
- Spaces may include members from multiple federations
- All notes in a space are owned by the space authority
- All space members can see all notes in the space
- Spaces may not include notes owned by other authorities

### **2.4 Purpose**

Answers the question:

> Who can see all content here by default?

---

## **3. Folders (Within Spaces)**

### **3.1 Definition**

Folders are structural containers inside a space.

### **3.2 Rules**

- Folders inherit space visibility
- Folders may be nested arbitrarily
- Folders cannot be shared
- Folders cannot alter permissions
- Folders cannot contain notes from other spaces

### **3.3 Purpose**

Answers the question:

> How is content organized within the space?

---

## **4. Notes**

### **4.1 Definition**

A **Note** is the smallest unit of content and the smallest externally shareable unit.

### **4.2 Properties**

    Note
    - note_id
    - space_id
    - authority_id
    - content
    - metadata

### **4.3 Rules**

- A note belongs to exactly one space
- A note is visible to all space members
- A note may be included in zero or more Share Groups
- A note may have per-note action restrictions
- A note cannot exist in multiple spaces simultaneously

---

## **5. Per-Note Action Permissions**

### **5.1 Definition**

Per-note permissions restrict **actions**, not visibility.

### **5.2 Allowed Restrictions**

- Read
- Comment
- Suggest
- Edit
- Lock
- Prevent delete
- Prevent move
- Prevent rename

### **5.3 Forbidden Capabilities**

- Restricting visibility
- Adding new viewers
- Creating sub-audiences
- Partial space visibility

### **5.4 Resolution Order**

    Effective Action Permission =
    least_privileged(
    	External Share Role (if applicable),
    	Note Policy,
    	Space Role
    )

### **5.5 Rule**

If a user can see a note, per-note policies only determine what they may do to it.

---

## **6. Collections**

### **6.1 Definition**

Collections are **local, per-user organizational folders for spaces**.

### **6.2 Rules**

- Collections are client-side only
- Collections are not shared
- Collections have no permissions
- Collections do not affect visibility
- Collections are not part of URLs or linking

### **6.3 Invariant**

Removing collections does not affect collaboration or access.

---

## **7. File Tree**

### **7.1 Purpose**

The file tree displays structural truth only.

### **7.2 Displays**

- Spaces
- Folders
- Notes

### **7.3 Does Not Display**

- External share groupings
- Permission bundles
- Visibility differences

### **7.4 Annotations**

Notes may display informational badges indicating:

- External sharing
- Locked or restricted actions

These annotations do not alter structure.

---

## **8. External Shares**

## **9\. Share Groups**

### **9.1 Definition**

An **is the only wat\* y to share a norte mm, re ,,h o outside of a space.f
A **Share Group\*\* is a first-class permission object representing an external share.

### **9.2 Properties**

    ShareGroup
    - share_group_id
    - owner_space_id
    - note_ids[]
    - user_ids[]
    - role (viewer | commenter | editor)

### **.3 Rules**

- Only listed notes are visible
- Only listed users receive access
- No inheritance
- No structure
- Not represented in the file tree

---

## **10\. Visibility Resolution (Authoritative)**

A user may see a note if and only if:

    user ∈ space.members
    OR
    (user ∈ share_group.users AND note ∈ share_group.notes)

Exactly one visibility source applies.

---

## **11\. External User Experience**

### **11.1 Entry Point**

.
**Shared with Me**

### **11.2 Display Model**

Each Share Group appears as a grouped entry.

    Shared with Me
    Project – Teacher Review
    - notes.md
    - research.md
    - summary.md

### **11.3 Restrictions**

External users:

- Cannot browse spaces or folders
- Cannot see sibling notes
- Cannot resolve non-shared links
- Cannot view backlinks or graphs

---

## **12\. Private Notes**

### **12.1 Definition**

A private note is a note in a single-user space.

### **12.2 Sharing**

Private notes are shared exclusively via Share Groups.

There is no separate private-sharing mechanism.

---

## **13\. Moving Notes Between Spaces**

.

### **13.1 Definition**

Moving a note between spaces changes its ownership and visibility.

### **13.2 Same-Authority Move**

- space_id is updated
- note_id remains unchanged
- Note becomes visible to destination space members
- All external shares are revoked

### **13.3 Cross-Authority Move**

- Conte. is exported
- New note is created under the destination authority
- New note_id is assigned
- Original note may be deleted explicitly
- Links are rewritten where possible

### **13.4 UX Requirement**

Users must be warned on move:

> Moving this note will make it visible to all members of the destination space.
> External shares will be removed.

---

## **15\. Explicitly Disallowed**

The system will never support:

- Nested spaces
- Folder-level sharing
- Structure-derived permissions
- Partial visibility inside a space
- Cross-authority notes within a space
- Implicit sharing
- Share Groups as navigable containers

---

## **16\. Model Summary**

.
**Layer**

**Responsibility**

Spaces

Visibility and ownership

Folders

Structure

Notes
.
Content

Note Policies

Action restrictions

Collections

Personal navigation

Share Groups

Explicit visibility exceptions
