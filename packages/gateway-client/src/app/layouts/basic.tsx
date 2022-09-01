import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import React from 'react';

type BasicLayoutProps = {
    children: React.ReactNode;
};

export default function BasicLayout({ children }: BasicLayoutProps) {
    const theme = useTheme();

    return (
        <Box
            sx={{
                width: '100%',
                backgroundColor: theme.palette.grey[200],
            }}
        >
            <Container
                maxWidth={'sm'}
                style={{
                    marginTop: theme.spacing(16),
                }}
            >
                <Paper
                    elevation={3}
                    style={{
                        padding: theme.spacing(2),
                    }}
                >
                    {children}
                </Paper>
            </Container>
        </Box>
    );
}
