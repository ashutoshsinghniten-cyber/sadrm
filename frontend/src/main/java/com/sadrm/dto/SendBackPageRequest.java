package com.sadrm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class SendBackPageRequest {

    @NotBlank(message = "filename is required.")
    private String filename;

    @NotBlank(message = "destination is required.")
    @Pattern(regexp = "hitl|qc|preprep", message = "destination must be one of: hitl, qc, preprep.")
    private String destination;

    private String reason;

    public String getFilename()            { return filename; }
    public void   setFilename(String v)    { this.filename = v; }
    public String getDestination()         { return destination; }
    public void   setDestination(String v) { this.destination = v; }
    public String getReason()              { return reason; }
    public void   setReason(String v)      { this.reason = v; }
}
