package org.musickg.backend.api;

import java.io.IOException;

final class PayloadTooLargeException extends IOException {
    PayloadTooLargeException() {
        super("PAYLOAD_TOO_LARGE");
    }
}
