import DesignServicesIcon from '@mui/icons-material/DesignServices';
import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const StyledNavbar = styled.div`
    header {
        background-color: #013cff;
    }

    .content {
        max-width: 100%;
    }

    .menu-container {
        flex-grow: 1;
        display: none;

        .menu {
            display: block;
        }
    }

    .title {
        svg {
            margin-top: 0.1em;
            display: flex;
            margin-right: 8px;
        }

        margin-right: 16px;
        display: flex;
        font-family: monospace;
        font-weight: 700;
        letter-spacing: 0.3rem;
        color: inherit;
        text-decoration: none;
    }

    .links {
        flex-grow: 1;
        display: flex;

        a {
            margin: 16px 0;
            color: white;
            display: block;
            text-decoration: none;
            font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;
            font-weight: 500;
            font-size: 0.875rem;
            line-height: 1.75;
            letter-spacing: 0.02857em;
            text-transform: uppercase;
        }
    }

    @media (max-width: 420px) {
        .menu-container {
            display: flex;
        }

        .title {
            flex-grow: 1;
        }

        .links {
            display: none;
        }
    }
`;

export const Navbar = () => {
    const menuContainerRef = useRef<HTMLDivElement | null>(null);
    const [anchorElNav, setAnchorElNav] = useState<null | HTMLElement>(null);

    const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElNav(event.currentTarget);
    };

    const handleCloseNavMenu = () => {
        setAnchorElNav(null);
    };

    return (
        <StyledNavbar ref={menuContainerRef}>
            <AppBar position="static">
                <Container className="content">
                    <Toolbar disableGutters>
                        <Box className="menu-container">
                            <IconButton
                                size="large"
                                aria-label="account of current user"
                                aria-controls="menu-appbar"
                                aria-haspopup="true"
                                onClick={handleOpenNavMenu}
                                color="inherit"
                            >
                                <MenuIcon />
                            </IconButton>

                            <Menu
                                className="menu"
                                container={menuContainerRef.current}
                                anchorEl={anchorElNav}
                                anchorOrigin={{
                                    vertical: 'bottom',
                                    horizontal: 'left',
                                }}
                                keepMounted
                                transformOrigin={{
                                    vertical: 'top',
                                    horizontal: 'left',
                                }}
                                open={Boolean(anchorElNav)}
                                onClose={handleCloseNavMenu}
                            >
                                <MenuItem onClick={handleCloseNavMenu}>
                                    <Typography textAlign="center">
                                        Status
                                    </Typography>
                                </MenuItem>
                            </Menu>
                        </Box>

                        <Typography
                            className="title"
                            variant="h6"
                            noWrap
                            component={Link}
                            to="/smz/pwa"
                        >
                            <DesignServicesIcon /> SamizdApp
                        </Typography>

                        <Box className="links">
                            <Typography
                                onClick={handleCloseNavMenu}
                                component={Link}
                                to="/smz/pwa/status"
                            >
                                Status
                            </Typography>
                        </Box>
                    </Toolbar>
                </Container>
            </AppBar>
        </StyledNavbar>
    );
};

export default Navbar;
