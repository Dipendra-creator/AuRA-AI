package engine

import "errors"

// ErrWaitingReview is returned by the review node executor to signal that
// the pipeline should pause and wait for human approval.
var ErrWaitingReview = errors.New("waiting_review")
