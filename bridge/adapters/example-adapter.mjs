/**
 * Adapter template.
 *
 * Write one of these when your agent runtime speaks its own protocol. The
 * bridge will call send() for every employee that lists this adapter in
 * bridge/config.json. Read credentials from process.env — never commit them.
 *
 * Return the agent's reply text. Throw on failure: the office surfaces the error
 * verbatim and marks the task failed. Never return invented text.
 */
export async function send({ agentId, model, messages, config }) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  // Example shape only — replace with your own authorised call.
  // const res = await fetch(`https://your-agent-runtime.example/agents/${agentId}/invoke`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     Authorization: `Bearer ${process.env.MY_AGENT_TOKEN}`,
  //   },
  //   body: JSON.stringify({ input: lastUser?.content, model }),
  // });
  // if (!res.ok) throw new Error(`Agent runtime HTTP ${res.status}`);
  // const json = await res.json();
  // return json.output;

  throw new Error(
    `Adapter for "${agentId}" is still the template. Edit bridge/adapters/example-adapter.mjs `
    + 'to call the runtime you are authorised to use. The office will not fake a reply.',
  );
}
