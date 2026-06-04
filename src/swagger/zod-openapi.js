import { toJSONSchema } from 'zod';

const schemaLocations = [
  { dtoKey: 'params', openApiIn: 'path' },
  { dtoKey: 'query', openApiIn: 'query' },
];

export const withZodDto = (operation, dto) => {
  return {
    ...operation,
    ...buildRequestBody(dto),
    parameters: [...(operation.parameters ?? []), ...buildParameters(dto)],
  };
};

export const zodToOpenApiSchema = (schema) => {
  return toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      const type = zodSchema._zod?.def?.type;

      if (type === 'bigint') {
        jsonSchema.type = 'integer';
        jsonSchema.format = 'int64';
      }

      if (type === 'date') {
        jsonSchema.type = 'string';
        jsonSchema.format = 'date-time';
      }
    },
  });
};

const buildRequestBody = (dto) => {
  const bodySchema = getDtoPart(dto, 'body');

  if (!bodySchema) {
    return {};
  }

  return {
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: zodToOpenApiSchema(bodySchema),
        },
      },
    },
  };
};

const buildParameters = (dto) => {
  return schemaLocations.flatMap(({ dtoKey, openApiIn }) => {
    const schema = getDtoPart(dto, dtoKey);

    if (!schema) {
      return [];
    }

    const openApiSchema = zodToOpenApiSchema(schema);
    const requiredFields = new Set(openApiSchema.required ?? []);

    return Object.entries(openApiSchema.properties ?? {}).map(([name, propertySchema]) => ({
      name,
      in: openApiIn,
      required: openApiIn === 'path' || requiredFields.has(name),
      schema: propertySchema,
    }));
  });
};

const getDtoPart = (dto, key) => {
  return dto?.shape?.[key];
};
