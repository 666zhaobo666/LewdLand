'use strict';

// Parse a README.md produced by the Telegram dump tool.
// Extracts: publish_date, source_chat, message_id, tags[], tags_text, title, description.
function parseReadme(text) {
  const out = {
    publish_date: null,
    source_chat: null,
    message_id: null,
    tags: [],
    tags_text: '',
    title: '',
    description: ''
  };
  if (!text) return out;

  const mPublish = text.match(/Published at \(UTC\):\s*`([^`]+)`/);
  if (mPublish) out.publish_date = mPublish[1].trim();

  const mChat = text.match(/Source chat:\s*`([^`]+)`/);
  if (mChat) out.source_chat = mChat[1].trim();

  const mMsg = text.match(/Original message ID:\s*`(\d+)`/);
  if (mMsg) out.message_id = Number(mMsg[1]);

  // Description section is between "## Description" and "## Files" (or end of doc).
  const descStart = text.indexOf('## Description');
  let descSection = '';
  if (descStart !== -1) {
    const afterHeader = descStart + '## Description'.length;
    const filesIdx = text.indexOf('## Files', afterHeader);
    descSection = filesIdx !== -1 ? text.slice(afterHeader, filesIdx) : text.slice(afterHeader);
  }

  // Collect all #tag tokens anywhere in the description section.
  const tagSet = new Set();
  const tagRe = /#([^\s#`]+)/g;
  let tm;
  while ((tm = tagRe.exec(descSection)) !== null) tagSet.add(tm[1]);
  out.tags = [...tagSet];
  out.tags_text = out.tags.map((t) => '#' + t).join(' ');

  // Non-tag text lines become title (first line) + description (all lines).
  const nonTagLines = descSection
    .split(/\r?\n/)
    .map((l) => l.replace(/#[^\s#`]+/g, '').trim())
    .filter((l) => l.length > 0);

  out.title = nonTagLines[0] || '';
  out.description = nonTagLines.join('\n').trim();
  return out;
}

module.exports = { parseReadme };
