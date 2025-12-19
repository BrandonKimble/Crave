CREATE OR REPLACE FUNCTION public.validate_entity_references(entity_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  IF array_length(entity_ids, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN (
    SELECT COUNT(*)
    FROM unnest(entity_ids) AS id
    WHERE id NOT IN (SELECT entity_id FROM public.core_entities)
  ) = 0;
END;
$$;

COMMENT ON FUNCTION public.validate_entity_references(uuid[]) IS
  'Validates that every UUID in the supplied array exists in core_entities.';
