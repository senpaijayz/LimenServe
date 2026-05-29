export function buildPublicCmsPageResponse(page) {
  if (!page) {
    return {
      statusCode: 200,
      body: {
        page: null,
        found: false,
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      page,
      found: true,
    },
  };
}
