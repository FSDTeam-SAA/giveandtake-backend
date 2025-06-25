export interface PaginationQuery {
  page?: string | number
  limit?: string | number
}

export interface PaginationParams {
  page: number
  limit: number
  skip: number
}

export function getPaginationParams(query: PaginationQuery): PaginationParams {
  const page = Math.max(1, parseInt(query.page as string) || 1)
  const limit = Math.max(1, parseInt(query.limit as string) || 10)
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export interface MetaPagination {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
}

export function buildMetaPagination(
  totalItems: number,
  page: number,
  limit: number
): MetaPagination {
  const totalPages = Math.ceil(totalItems / limit)
  return {
    currentPage: page,
    totalPages,
    totalItems,
    itemsPerPage: limit,
  }
}
