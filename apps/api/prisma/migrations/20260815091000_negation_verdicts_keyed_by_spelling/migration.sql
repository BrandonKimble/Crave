-- B-key (2026-08-15): the negation lane's claim unit becomes SPELLING ALONE.
--
-- Its only consumer (JudgedVocabularyService.negatingForms) is locale-blind BY
-- RULING — a form ruled a negator in any language is withheld from the
-- embedder in every language — so every per-locale hearing after the first
-- bought an answer nothing could read. Re-key in place rather than re-buy:
-- the answers are correct, only their address was wrong.
--
-- SEMANTICS PRESERVED EXACTLY: the collapse keeps ANY-LANGUAGE-YES, which is
-- what the in-memory set already computed. A form with a 'negates' verdict in
-- any locale collapses to 'negates', carrying that row's stated ground; a form
-- nobody ruled a negator keeps its most recent 'does-not-negate' ruling.
-- Per-rule-version and per-fold-version, because a verdict answers a question
-- asked under one rule and spelled by one fold.

CREATE TEMP TABLE negation_collapsed ON COMMIT DROP AS
SELECT DISTINCT ON (rule_version, fold_version, form)
       rule_version, fold_version, form, outcome, reason, rule_fingerprint,
       subject, source, decided_at, executed_at
  FROM (
    SELECT rule_version,
           fold_version,
           substring(claim_key from position('|' in claim_key) + 1) AS form,
           outcome, reason, rule_fingerprint, subject, source,
           decided_at, executed_at
      FROM claim_verdicts
     WHERE lane = 'word-negation'
  ) spelled
 ORDER BY rule_version, fold_version, form,
          (outcome = 'negates') DESC, decided_at DESC;

DELETE FROM claim_verdicts WHERE lane = 'word-negation';

INSERT INTO claim_verdicts
  (lane, claim_key, rule_version, fold_version, outcome, reason,
   rule_fingerprint, subject, source, decided_at, executed_at)
SELECT 'word-negation',
       'und|' || form,
       rule_version, fold_version, outcome, reason, rule_fingerprint,
       -- The subject is what a resume replays; its locale is now 'und' too,
       -- or a replayed hearing would re-ask under a locale the key no longer
       -- carries.
       jsonb_set(coalesce(subject, '{}'::jsonb), '{locale}', '"und"'),
       source, decided_at, executed_at
  FROM negation_collapsed;
