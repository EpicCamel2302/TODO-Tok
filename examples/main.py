#!/usr/bin/env python3

# TODO: Add type hints to all functions
def process_data(data):
    """
    TODO: Add proper documentation
    This function processes the input data.
    """
    # FIXME: Handle edge cases
    if not data:
        return None

    # BUG: Sometimes returns incorrect results for negative numbers
    return transform_data(data)

''' TODO_OPTIMIZE: Use numpy for better performance '''
def transform_data(data):
    # HACK: Quick fix for data normalization
    result = []
    for item in data:
        result.append(item * 2)
    return result

# XXX: Consider splitting this into multiple functions
def main():
    """Main entry point

    TODO: Add proper error handling
    """
    data = [1, 2, 3]
    process_data(data)
