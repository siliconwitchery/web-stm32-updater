// ISC License
// 
// Copyright 2022 Silicon Witchery AB
// 
// Permission to use, copy, modify, and/or distribute this software for any 
// purpose with or without fee is hereby granted, provided that the above 
// copyright notice and this permission notice appear in all copies.
// 
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH 
// REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY 
// AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, 
// INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM 
// LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR 
// OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR 
// PERFORMANCE OF THIS SOFTWARE.
//  
//  
//      This file contains everything needed for implementing a basic USB 
//      firmware upgrade using Chrome to STM32 based devices. This is how to get 
//      started
//   
//      Firstly, include this file into your HTML <head> block:
//  
//          <script src="usbDfuDevice.js"></script>
//   
//      Then create an instance of the dfu object inside your <script> block:
//  
//          let dfu = new usbDfuDevice();
//  
//      Once you have retrieved your update.bin file, call the function
//      runUpdateSequence() and pass the arrayBuffer containing your 
//      firmware.
//  
//          await dfu.runUpdateSequence(binaryData);
//  
//      A connection pane will appear, and any devices with the STM32 vendorID 
//      will be shown. Note the device must be in DFU mode. This is usually 
//      achieved by holding the BOOT pin during reset of the STM32. The update 
//      sequence function is asynchronous so the await keyword can be used. It 
//      returns a promise on completion.
//   
//      It's also possible to call the update steps manually. Look at the 
//      runUpdateSequence() function to see how this is done.
//
//      Further details on how the DFU sequence should work can be found within 
//      this application note:
//  
//          https://www.st.com/resource/en/application_note/cd00264379-usb-dfu-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf
//  
//      The exact specification of the USB DFU protocol is documented here:
//  
//          https://www.usb.org/sites/default/files/DFU_1.1.pdf
//  
//      More details of the WebUSB API can be found here: 
//  
//          https://web.dev/usb/
//
//      To learn more about us, visit out website:
//
//          https://www.siliconwitchery.com


// Class constructor containing all the DFU functions and parameters 
let usbDfuDevice = class {

    // List of DFU requests we can perform. These are according to the DFU spec
    dfuRequest = {
        DFU_DETACH: 0x00,
        DFU_DNLOAD: 0x01,
        DFU_UPLOAD: 0x02,
        DFU_GETSTATUS: 0x03,
        DFU_CLRSTATUS: 0x04,
        DFU_GETSTATE: 0x05,
        DFU_ABORT: 0x06
    }

    // List of states the DFU state machine can be in. Also according to spec
    dfuState = {
        STATE_APP_IDLE: 0,
        STATE_APP_DETACH: 1,
        STATE_IDLE: 2,
        STATE_DNLOAD_SYNC: 3,
        STATE_DNBUSY: 4,
        STATE_DNLOAD_IDLE: 5,
        STATE_MANIFEST_SYNC: 6,
        STATE_MANIFEST: 7,
        STATE_MANIFEST_WAIT_RESET: 8,
        STATE_UPLOAD_IDLE: 9,
        STATE_ERROR: 10
    }

    // Finally, the list of error codes which can return. Again part of the spec
    dfuError = {
        OK: 0,
        ERROR_TARGET: 1,
        ERROR_FILE: 2,
        ERROR_WRITE: 3,
        ERROR_ERASE: 4,
        ERROR_CHECK_ERASED: 5,
        ERROR_PROG: 6,
        ERROR_VERIFY: 7,
        ERROR_ADDRESS: 8,
        ERROR_NOTDONE: 9,
        ERROR_FIRMWARE: 10,
        ERROR_VENDOR: 11,
        ERROR_USBR: 12,
        ERROR_POR: 13,
        ERROR_UNKNOWN: 14,
        ERROR_STALLEDPKT: 15
    }

    // When an new instance of the dfu object is created, this will be called
    constructor() {

        // Creates a null device object
        this.device = null;
    }

    // Helper function to get the latest DFU status. Often required before new 
    // operations
    async getStatus() {

        // Get 6 bytes with the status command
        let result = await this.device.controlTransferIn({
            requestType: 'class',
            recipient: 'interface',
            request: this.dfuRequest.DFU_GETSTATUS,
            value: 0,
            index: 0
        }, 6);

        // Extract error value
        let error = result.data.getUint8(0);

        // Extract state code
        let state = result.data.getUint8(4);

        // Extract the timeout value
        let pollTime = result.data.getUint8(1);

        // Wait for the given time
        console.log("Waiting: " + pollTime + "ms")
        await new Promise(resolve => setTimeout(resolve, pollTime));

        // If there is an error, or the state machine enters the error state
        if (error != this.dfuError.OK ||
            state == this.dfuState.STATE_ERROR) {

            // Return the error
            Promise.reject(
                "Error: " + Object.keys(dfu.dfuError)[error] +
                " in dfu state: " + Object.keys(dfu.dfuState)[state]
            );
        }

        // TODO just for debugging, we can remove this later
        console.log("Status: " + Object.keys(dfu.dfuError)[error] +
            " in dfu state: " + Object.keys(dfu.dfuState)[state])

        // Otherwise just return the state
        Promise.resolve(state);
    }

    // Helper function which clears any pending status in the DFU engine
    async clearStatus() {

        // Issue tge status clear command
        let result = await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: this.dfuRequest.DFU_CLRSTATUS,
            value: 0,
            index: 0
        }, undefined)

        // If error
        if (result.status != 'ok') {

            // Return rejection
            Promise.reject("Couldn't clear status");
        }

        Promise.resolve();
    }

    // Function to connect, returning status as promise
    async connect() {

        // Try to connect
        try {

            // First ensure WebUSB is available
            if (!navigator.usb) {
                Promise.reject("USB not available. Are you using Chrome?");
            }

            // Request the device, filtering by ST-Micro's vendor ID
            this.device = await navigator.usb.requestDevice({
                filters: [{
                    vendorId: 0x0483
                }]
            });

            // Open the device
            await this.device.open();

            // Select configuration
            await this.device.selectConfiguration(1);

            // Claim interface
            await this.device.claimInterface(0);

            // Done and return
            return Promise.resolve();
        }

        // Return the error if any of the above fails
        catch (error) {
            return Promise.reject(error);
        }
    }

    // Function which erases the device
    async erase() {

        // First clear the current status
        await this.clearStatus();

        // For the entire 128k of flash, increment 1 page (128 bytes) at a time. 
        // Starting at 0x08000000
        // TODO make this dynamic depending on device flash size, or binary size
        for (var address = 0x8000000; address < 0x8020000; address += 0x80) {

            // TODO just for debugging, we can remove this
            console.log("Erasing 128 bytes at 0x0" + address.toString(16).toUpperCase());

            // Create an array with the erase command and address we want to 
            // erase (LSB first)
            let arr = new Uint8Array([
                0x41,
                (address & 0x000000ff),
                (address & 0x0000ff00) >> 8,
                (address & 0x00ff0000) >> 16,
                (address & 0xff000000) >> 24
            ]);

            // Perform the erase
            await this.device.controlTransferOut({
                requestType: 'class',
                recipient: 'interface',
                request: this.dfuRequest.DFU_DNLOAD,
                value: 0, // wValue Should be 0 for command mode
                index: 0
            }, arr); // Holds the erase instruction and address location

            // Issue a get status to apply the operation
            await this.getStatus();

            // Check again if it was successful
            await this.getStatus();

            // Work out the percentage done and update the progress bar
            var done = (100 / (0x8020000 - 0x8000000)) * (address - 0x8000000);

            // Update the progress bar
            dfuProgressHandler(done);
        }

        // Resolve when done
        return Promise.resolve();
    }

    // Function to program the device
    async program() {
        // TODO
        return Promise.resolve();
    }

    // Sequence to exit DFU mode, and start the application
    async detach() {

        // First clear the current state
        await this.clearStatus();

        // Next download 0 bytes to the device
        await this.device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: this.dfuRequest.DFU_DNLOAD,
            value: 0, // Write 0 bytes
            index: 0
        }, undefined)

        // Finally read the status to trigger a reset
        await this.getStatus();
    }

    // Function which disconnects the USB device
    async disconnect() {

        // Attempt to shutdown the USB connection
        try {

            // If the device exists
            if (this.device != null) {

                // Close the USB device
                await this.device.close();
            }

            // Return resolved
            Promise.resolve();
        }

        // Otherwise return the error
        catch (error) {

            // Return the error
            Promise.reject(error);
        }

        // Null the device
        this.device = null;

        // Call the user disconnect handler to clean up the UI
        dfuDisconnectHandler();
    }

    // Executes the full DFU sequence. 
    async runUpdateSequence(binArray) {

        // Attempt the sequence
        try {

            // Update the state
            dfuStatusHandler("Connecting");

            // Connect
            await this.connect();

            // Update the state
            dfuStatusHandler("Erasing");

            // Erase the chip
            await this.erase();

            // Update the state
            dfuStatusHandler("Programming");

            // Program the chip
            await this.program();

            // Update the state
            dfuStatusHandler("Booting");

            // Detach the device
            await this.detach();

            // Update the state
            dfuStatusHandler("Disconnecting");

            // Disconnect
            await this.disconnect();

            // Return success
            Promise.resolve("Update Complete");
        }

        // Catch errors
        catch (error) {

            // Always disconnect on error
            this.disconnect();

            // Return the error
            Promise.reject(error);
        }
    }
}