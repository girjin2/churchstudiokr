package com.churchstudio.phonecamera.transport;

/** Phase 1 placeholder. No USB communication is performed. */
public final class NoOpPhoneTransport implements PhoneTransport {
    @Override
    public void start() {
    }

    @Override
    public void stop() {
    }

    @Override
    public boolean isConnected() {
        return false;
    }
}
