package com.churchstudio.phonecamera.transport;

/**
 * Phase 2 integration boundary.
 *
 * The USB/AOA transport work from the other workstream should be connected here
 * without changing the camera UI/lifecycle code in MainActivity.
 */
public interface PhoneTransport {
    void start();
    void stop();
    boolean isConnected();
}
