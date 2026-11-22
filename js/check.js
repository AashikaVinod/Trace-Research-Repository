// Self-check page logic (see check.html). Runs only when that page is opened.
    const results = document.getElementById('results');
    const summary = document.getElementById('summary');
    const rows = [];
    let passed = 0, failed = 0, warned = 0;

    function add(status, name, detail) {
      rows.push({ status, name, detail });
      if (status === 'pass') passed++; else if (status === 'fail') failed++; else warned++;
      render();
    }
    function render() {
      results.innerHTML = rows.map((r) => `<div class="check ${r.status}"><b>${r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'CHECK' : 'FAIL'}</b><span>${escapeHtml(r.name)}<small>${escapeHtml(r.detail || '')}</small></span></div>`).join('');
      summary.textContent = `${passed} passed, ${failed} failed, ${warned} to look at.`;
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    async function api(path, options = {}) {
      const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
      return { ok: response.ok, status: response.status, body };
    }
    async function count(table) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
      const range = response.headers.get('content-range') || '';
      return { ok: response.ok, total: Number(range.split('/')[1]) };
    }

    async function run() {
      // 1. Settings
      if (!SUPABASE_URL || !SUPABASE_KEY) return add('fail', 'config.js has your URL and key', 'One or both values are empty.');
      if (SUPABASE_URL.includes('your-project-ref')) return add('fail', 'config.js has your real URL', 'SUPABASE_URL is still the placeholder. Replace it with your project URL.');
      if (SUPABASE_KEY.startsWith('sb_secret_') || SUPABASE_KEY.includes('service_role')) return add('fail', 'config.js holds only the publishable key', 'A secret or service_role key was found. Remove it and reset it in Supabase.');
      add('pass', 'config.js has a URL and a publishable key', SUPABASE_URL);

      // 2. Reachable
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
        if (response.status >= 500) return add('fail', 'Supabase answers', `HTTP ${response.status}. The project may be paused.`);
        add('pass', 'Supabase answers from this browser', `HTTP ${response.status}`);
      } catch (error) {
        return add('fail', 'Supabase answers from this browser', 'The request never arrived. The URL is wrong, or the project is paused.');
      }

      // 3. Starter data
      const expected = { research_project: 1, observation: 8, source: 4, finding: 5, design_decision: 3 };
      for (const [table, want] of Object.entries(expected)) {
        const got = await count(table);
        if (!got.ok) add('fail', `Table ${table} can be read`, 'The request was refused. Check that install.sql was run.');
        else if (got.total === want) add('pass', `${table}: ${got.total} rows (starter study)`);
        else add('warn', `${table}: ${got.total} rows`, `The starter study has ${want}. Fine if you have added your own data.`);
      }

      // 4. The SQL views and the recursive function
      const dec = await api('/rest/v1/v_decision_strength?select=id,title,observations&order=id');
      if (dec.ok && Array.isArray(dec.body) && dec.body.length) add('pass', 'SQL view v_decision_strength returns rows', `${dec.body.length} decisions`);
      else add('fail', 'SQL view v_decision_strength returns rows', JSON.stringify(dec.body).slice(0, 200));

      const lineage = await api('/rest/v1/rpc/trace_lineage', { method: 'POST', body: JSON.stringify({ p_type: 'design_decision', p_id: 1 }) });
      if (lineage.ok && Array.isArray(lineage.body)) {
        const n = lineage.body.length;
        if (n === 9) add('pass', 'Recursive function trace_lineage walks the chain', `${n} rows for decision 1 (1 decision, 1 recommendation, 1 insight, 2 findings, 4 observations)`);
        else add('warn', 'Recursive function trace_lineage walks the chain', `${n} rows for decision 1. The starter study gives 9.`);
      } else add('fail', 'Recursive function trace_lineage works', JSON.stringify(lineage.body).slice(0, 200));

      // 5. Photos load from Storage
      const sources = await api('/rest/v1/source?select=title,file_url');
      if (sources.ok && Array.isArray(sources.body)) {
        let loaded = 0;
        for (const src of sources.body) {
          const url = `${SUPABASE_URL}/storage/v1/object/public/sources/${encodeURIComponent(src.file_url)}`;
          const image = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(true); i.onerror = () => resolve(false); i.src = url; });
          if (image) loaded++;
          else add('fail', `Photo loads: ${src.title}`, `Not found at ${src.file_url}. Upload it to the sources bucket with this exact name.`);
        }
        if (loaded === sources.body.length && sources.body.length) add('pass', `All ${loaded} photos load from Storage`);
      }

      // 6. Writes: add a note, read it back, delete it
      const author = await api('/rest/v1/researcher?select=id&limit=1');
      const finding = await api('/rest/v1/finding?select=id&limit=1');
      if (author.ok && finding.ok && author.body[0] && finding.body[0]) {
        const created = await api('/rest/v1/note', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ body: 'Self-check test note (deleted automatically)', author_id: author.body[0].id, finding_id: finding.body[0].id }) });
        if (created.ok && created.body && created.body[0]) {
          add('pass', 'Adding a row works (a test note was saved)');
          const id = created.body[0].id;
          const removed = await api(`/rest/v1/note?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
          if (removed.ok && Array.isArray(removed.body) && removed.body.length === 1) add('pass', 'Deleting a row works (the test note was removed)');
          else add('fail', 'Deleting a row works', 'The test note could not be removed. Delete "Self-check test note" by hand in Table Editor.');
        } else add('fail', 'Adding a row works', JSON.stringify(created.body).slice(0, 200));
      }

      // 7. Protection: deleting a session that still has observations must be refused
      const session = await api('/rest/v1/research_session?select=id&id=eq.1');
      const refused = await api('/rest/v1/research_session?id=eq.1', { method: 'DELETE' });
      if (!refused.ok && /23503|violates foreign key/i.test(JSON.stringify(refused.body))) add('pass', 'The database refuses to delete a session with observations');
      else if (refused.ok) add('fail', 'The database refuses to delete a session with observations', 'The session was deleted. Re-run install.sql to restore the starter study.');
      else add('warn', 'The database refuses to delete a session with observations', `Refused with: ${JSON.stringify(refused.body).slice(0, 160)}`);
      if (!session.ok) add('warn', 'Session 1 exists', 'It was not found. Check the starter data.');

      add('pass', 'Self-check finished', 'Keep this page private, or delete check.html from the repository before showing the site.');
    }
    run();
