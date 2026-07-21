package com.sadrm.dto;

import java.util.List;
import java.util.Map;

public class AiExtractionRequest {

    // system can be a plain String or a List of content blocks (for prompt-caching via cache_control).
    private Object system;
    private List<Map<String, Object>> messages;
    private Integer maxTokens;
    // When true: use cheap model first, escalate to expensive model only if confidence is low.
    private Boolean smartRouting;

    public AiExtractionRequest() {
    }

    public Object getSystem() {
        return system;
    }

    public void setSystem(Object system) {
        this.system = system;
    }

    public List<Map<String, Object>> getMessages() {
        return messages;
    }

    public void setMessages(List<Map<String, Object>> messages) {
        this.messages = messages;
    }

    public Integer getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(Integer maxTokens) {
        this.maxTokens = maxTokens;
    }

    public Boolean getSmartRouting() {
        return smartRouting;
    }

    public void setSmartRouting(Boolean smartRouting) {
        this.smartRouting = smartRouting;
    }
}
