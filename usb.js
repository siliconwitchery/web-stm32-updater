// Instructions of how the DFU sequence should work can be found in this app note:
//   https://www.st.com/resource/en/application_note/cd00264379-usb-dfu-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf
//
// Exact spec of the USB DFU protocol is here:
//   https://www.usb.org/sites/default/files/DFU_1.1.pdf
//
// More details of the WebUSB API can be found here: 
//   https://web.dev/usb/


let dfuDevice = class {

    // List of DFU requests we can perform
    dfuRequest = {
        DFU_DETACH: 0x00,
        DFU_DNLOAD: 0x01,
        DFU_UPLOAD: 0x02,
        DFU_GETSTATUS: 0x03,
        DFU_CLRSTATUS: 0x04,
        DFU_GETSTATE: 0x05,
        DFU_ABORT: 0x06
    }

    // List of states the DFU state machine can go into
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

    // List of Status error codes
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

    // Setup
    constructor() {

        // Create a null device object
        this.device = null;
    }

    // Local function to get the DFU status and catch errors
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
                "Error: " + Object.keys(dfu.dfuError)[error] + " in dfu state: " + Object.keys(dfu.dfuState)[state]
            );
        }

        console.log("Status: " + Object.keys(dfu.dfuError)[error] + " in dfu state: " + Object.keys(dfu.dfuState)[state])

        // Otherwise just return the state
        Promise.resolve(state);
    }

    // Clears any pending status in the DFU engine
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
                Promise.reject("USB not available on this browser. Are you using Chrome?");
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

        // For the entire 128k of flash, increment 1 page (128 bytes) at a time. Starting at 0x08000000
        for (var address = 0x8000000; address < 0x8020000; address += 0x80) {

            console.log("Erasing 128 bytes at 0x0" + address.toString(16).toUpperCase());

            // Create an array with the erase command and address we want to erase (LSB first)
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
            }, arr); // Array which holds the erase instruction and address location

            // Issue a get status to apply the operation
            await this.getStatus();

            // Check again if it was successful
            await this.getStatus();

            // Work out the percentage done and update the progress bar
            var done = (100 / (0x8020000 - 0x8000000)) * (address - 0x8000000);

            // Update the progress bar
            updateProgressBarHandler(done);
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
        disconnectHandler();
    }
}