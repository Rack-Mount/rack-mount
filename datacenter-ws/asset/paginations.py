from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    StandardResultsSetPagination is a custom pagination class that extends PageNumberPagination.
    It sets the default page size to 5 and allows clients to set a custom page size using the 
    'page_size' query parameter, with a maximum limit of 100 items per page.

    Attributes:
        page_size (int): The default number of items per page.
        page_size_query_param (str): The query parameter name for specifying the page size.
        max_page_size (int): The maximum number of items allowed per page.
    """
    page_size = 5
    page_size_query_param = 'page_size'
    max_page_size = 100
