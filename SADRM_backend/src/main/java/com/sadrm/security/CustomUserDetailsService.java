package com.sadrm.security;

import com.sadrm.model.User;
import com.sadrm.repository.UserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public CustomUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

        String roleAuthority = "ROLE_" + user.getRole().toUpperCase();

        return org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password(user.getHash())
                .authorities(List.of(new SimpleGrantedAuthority(roleAuthority)))
                .accountLocked(!user.isActive())
                .build();
    }
}
