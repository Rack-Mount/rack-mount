from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    Standard pagination class shared across all apps.

    Default page size: 25 items. Clients can override via ``page_size``
    query param up to a maximum of 100 items per page.
    """

    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100
