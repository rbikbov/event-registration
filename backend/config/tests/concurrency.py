import threading
from collections.abc import Callable, Sequence

from django.db import connection


def run_together[T](calls: Sequence[Callable[[], T]]) -> list[T]:
    """Run the calls in threads released at the same moment; re-raise the first failure."""
    barrier = threading.Barrier(len(calls))
    results: list[T | None] = [None] * len(calls)
    errors: list[BaseException] = []

    def worker(index: int) -> None:
        try:
            barrier.wait(timeout=10)
            results[index] = calls[index]()
        except BaseException as exc:
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(len(calls))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    # A hung thread would leave None in the results and keep its connection open.
    assert not any(thread.is_alive() for thread in threads), "a worker thread did not finish"
    if errors:
        raise errors[0]
    return results  # type: ignore[return-value]  # no None left: every worker either set it or raised
