-- 60-chat: the team group's history, the departments' groups, private
-- chats, "קראתי" on announcements and everyone's read marks.
--
-- Written directly: sending 2,000 messages through public.send_chat_message
-- would tell the group of 300 about each of them. The team group and each
-- department's opened with their business and department (20-business), so
-- a message names its conversation by a key ("team", "department:<id>",
-- "direct:<id>"), found here. Each conversation's last message is set after.

-- step: directs
insert into public.chat_conversations (
  id, business_id, kind, person_a, person_b, created_at, changed_at
)
select r.id, r.business, 'direct', r.person_a, r.person_b, r.created_at, r.created_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, person_a uuid, person_b uuid, created_at timestamptz);

-- step: messages
insert into public.chat_messages (
  id, business_id, conversation_id, author_id, draft_id, kind, body, pinned, created_at
)
select r.id, r.business, c.id, r.author, r.draft, r.kind, r.body, r.pinned, r.created_at
from jsonb_to_recordset($1::jsonb)
  as r (id uuid, business uuid, conversation text, author uuid, draft uuid, kind text,
    body text, pinned boolean, created_at timestamptz)
join (
  select c.id, c.business_id,
    case c.kind
      when 'team' then 'team'
      when 'department' then 'department:' || c.department_id
      else 'direct:' || c.id
    end as conversation_key
  from public.chat_conversations c
  where c.business_id::text like '5ca1e300-%'
) c on c.business_id = r.business and c.conversation_key = r.conversation;

-- step: acks
insert into public.chat_acks (message_id, business_id, user_id, acked_at)
select r.message, r.business, r.person, r.acked_at
from jsonb_to_recordset($1::jsonb)
  as r (message uuid, business uuid, person uuid, acked_at timestamptz);

-- step: reads
insert into public.chat_reads (conversation_id, business_id, user_id, read_at)
select c.id, r.business, r.person, r.read_at
from jsonb_to_recordset($1::jsonb)
  as r (business uuid, conversation text, person uuid, read_at timestamptz)
join (
  select c.id, c.business_id,
    case c.kind
      when 'team' then 'team'
      when 'department' then 'department:' || c.department_id
      else 'direct:' || c.id
    end as conversation_key
  from public.chat_conversations c
  where c.business_id::text like '5ca1e300-%'
) c on c.business_id = r.business and c.conversation_key = r.conversation;

-- step: last_messages
update public.chat_conversations c
set last_message_at = m.last_at, changed_at = greatest(c.changed_at, m.last_at)
from (
  select cm.conversation_id, max(cm.created_at) as last_at
  from public.chat_messages cm
  where cm.business_id::text like '5ca1e300-%'
  group by cm.conversation_id
) m
where c.id = m.conversation_id;
