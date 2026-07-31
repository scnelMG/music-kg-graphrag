package org.musickg.backend.api;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

final class PayloadLimitRequestWrapper extends HttpServletRequestWrapper {
    private final int maxPayloadBytes;
    private ServletInputStream inputStream;

    PayloadLimitRequestWrapper(HttpServletRequest request, int maxPayloadBytes) {
        super(request);
        this.maxPayloadBytes = maxPayloadBytes;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
        if (inputStream == null) inputStream = new CountingServletInputStream(super.getInputStream(), maxPayloadBytes);
        return inputStream;
    }

    @Override
    public BufferedReader getReader() throws IOException {
        String encoding = getCharacterEncoding();
        Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
        return new BufferedReader(new InputStreamReader(getInputStream(), charset));
    }

    private static final class CountingServletInputStream extends ServletInputStream {
        private final ServletInputStream delegate;
        private final int maxPayloadBytes;
        private int consumed;

        private CountingServletInputStream(ServletInputStream delegate, int maxPayloadBytes) {
            this.delegate = delegate;
            this.maxPayloadBytes = maxPayloadBytes;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value != -1) count(1);
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws IOException {
            int read = delegate.read(bytes, offset, length);
            if (read != -1) count(read);
            return read;
        }

        @Override
        public boolean isFinished() { return delegate.isFinished(); }

        @Override
        public boolean isReady() { return delegate.isReady(); }

        @Override
        public void setReadListener(ReadListener readListener) { delegate.setReadListener(readListener); }

        private void count(int count) throws PayloadTooLargeException {
            consumed += count;
            if (consumed > maxPayloadBytes) throw new PayloadTooLargeException();
        }
    }
}
